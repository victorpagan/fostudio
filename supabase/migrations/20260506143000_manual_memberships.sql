-- Manual / comped memberships.
-- These rows use the normal membership entitlement path without creating or
-- pretending to own Square subscriptions.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS membership_source text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS manual_grants_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manual_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_reason text,
  ADD COLUMN IF NOT EXISTS manual_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memberships_membership_source_check'
      AND conrelid = 'public.memberships'::regclass
  ) THEN
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_membership_source_check
      CHECK (membership_source IN ('square', 'manual'));
  END IF;
END $$;

UPDATE public.memberships
   SET membership_source = CASE
     WHEN lower(coalesce(billing_provider, '')) = 'manual' THEN 'manual'
     ELSE 'square'
   END
 WHERE membership_source IS NULL
    OR membership_source NOT IN ('square', 'manual');

CREATE INDEX IF NOT EXISTS memberships_source_status_idx
  ON public.memberships (membership_source, status, current_period_end);

CREATE INDEX IF NOT EXISTS memberships_manual_expiry_idx
  ON public.memberships (manual_expires_at)
  WHERE membership_source = 'manual';

CREATE TABLE IF NOT EXISTS public.admin_manual_membership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('assign', 'update', 'revoke', 'grant_settings_update')),
  tier text,
  cadence text,
  manual_grants_enabled boolean,
  manual_expires_at timestamptz,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_manual_membership_events_user_idx
  ON public.admin_manual_membership_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_manual_membership_events_membership_idx
  ON public.admin_manual_membership_events (membership_id, created_at DESC);

ALTER TABLE public.admin_manual_membership_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manual_membership_events_staff_all" ON public.admin_manual_membership_events;
CREATE POLICY "admin_manual_membership_events_staff_all"
  ON public.admin_manual_membership_events
  FOR ALL
  TO authenticated
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

CREATE OR REPLACE FUNCTION public.schedule_membership_credit_grants(
  p_membership_id uuid,
  p_invoice_id text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.memberships%ROWTYPE;
  v_credits_per_month numeric(8,2);
  v_credit_expiry_days integer := 90;
  v_index integer := 0;
  v_due_at timestamptz;
  v_grant_month_start date;
  v_rows_changed integer := 0;
  v_last_row_count integer := 0;
  v_reason text := COALESCE('invoice:' || NULLIF(p_invoice_id, ''), 'manual_reschedule');
  v_step_interval interval := interval '1 month';
  v_preferred_provider text := 'square';
BEGIN
  IF p_membership_id IS NULL THEN
    RAISE EXCEPTION 'membership id is required';
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end <= p_period_start THEN
    RAISE EXCEPTION 'invalid billing period';
  END IF;

  SELECT *
    INTO v_membership
    FROM public.memberships
    WHERE id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found: %', p_membership_id;
  END IF;

  v_preferred_provider := CASE
    WHEN COALESCE(v_membership.membership_source::text, '') = 'manual'
      OR COALESCE(v_membership.billing_provider::text, '') = 'manual'
      THEN 'manual'
    ELSE 'square'
  END;

  SELECT v.credits_per_month
    INTO v_credits_per_month
    FROM public.membership_plan_variations v
    WHERE v.tier_id = v_membership.tier::text
      AND v.cadence = v_membership.cadence::text
      AND v.provider = v_preferred_provider
    ORDER BY v.active DESC, v.sort_order ASC
    LIMIT 1;

  IF v_credits_per_month IS NULL AND v_preferred_provider = 'manual' THEN
    SELECT v.credits_per_month
      INTO v_credits_per_month
      FROM public.membership_plan_variations v
      WHERE v.tier_id = v_membership.tier::text
        AND v.cadence = v_membership.cadence::text
        AND v.provider = 'square'
      ORDER BY v.active DESC, v.sort_order ASC
      LIMIT 1;
  END IF;

  IF v_credits_per_month IS NULL THEN
    RAISE EXCEPTION 'missing plan variation for membership %', p_membership_id;
  END IF;

  SELECT COALESCE(t.credit_expiry_days, 90)
    INTO v_credit_expiry_days
    FROM public.membership_tiers t
    WHERE t.id = v_membership.tier::text
    LIMIT 1;

  IF v_credit_expiry_days IS NULL OR v_credit_expiry_days < 1 THEN
    SELECT COALESCE((cfg.value #>> '{}')::integer, 90)
      INTO v_credit_expiry_days
      FROM public.system_config cfg
      WHERE cfg.key = 'credit_expiry_days'
      LIMIT 1;
  END IF;

  v_step_interval := CASE COALESCE(v_membership.cadence::text, 'monthly')
    WHEN 'daily' THEN interval '1 day'
    WHEN 'weekly' THEN interval '7 days'
    ELSE interval '1 month'
  END;

  UPDATE public.membership_credit_grants
     SET status = 'canceled',
         last_error = v_reason,
         processed_at = NULL,
         processed_credits = NULL,
         ledger_entry_id = NULL,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'replaced_at', now(),
           'replacement_reason', v_reason
         )
   WHERE membership_id = p_membership_id
     AND status <> 'processed'
     AND due_at >= p_period_start;

  v_due_at := p_period_start;
  WHILE v_due_at < p_period_end LOOP
    v_grant_month_start := (v_due_at AT TIME ZONE 'UTC')::date;

    INSERT INTO public.membership_credit_grants (
      membership_id,
      user_id,
      invoice_id,
      billing_period_start,
      billing_period_end,
      grant_month_index,
      grant_month_start,
      due_at,
      credits,
      processed_credits,
      status,
      ledger_entry_id,
      last_error,
      metadata,
      processed_at
    )
    VALUES (
      v_membership.id,
      v_membership.user_id,
      NULLIF(p_invoice_id, ''),
      p_period_start,
      p_period_end,
      v_index,
      v_grant_month_start,
      v_due_at,
      v_credits_per_month,
      NULL,
      'scheduled',
      NULL,
      NULL,
      jsonb_build_object(
        'scheduled_from', COALESCE(NULLIF(p_invoice_id, ''), 'manual'),
        'credit_expiry_days', v_credit_expiry_days,
        'membership_source', COALESCE(v_membership.membership_source::text, v_membership.billing_provider::text, 'square')
      ),
      NULL
    )
    ON CONFLICT (membership_id, billing_period_start, billing_period_end, due_at)
    DO UPDATE
      SET user_id = EXCLUDED.user_id,
          invoice_id = EXCLUDED.invoice_id,
          grant_month_index = EXCLUDED.grant_month_index,
          grant_month_start = EXCLUDED.grant_month_start,
          credits = EXCLUDED.credits,
          processed_credits = NULL,
          status = 'scheduled',
          ledger_entry_id = NULL,
          last_error = NULL,
          metadata = EXCLUDED.metadata,
          processed_at = NULL
      WHERE public.membership_credit_grants.status <> 'processed';

    GET DIAGNOSTICS v_last_row_count = ROW_COUNT;
    v_rows_changed := v_rows_changed + v_last_row_count;

    v_due_at := v_due_at + v_step_interval;
    v_index := v_index + 1;
  END LOOP;

  RETURN v_rows_changed;
END;
$$;
