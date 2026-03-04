-- =============================================================================
-- Recurring membership credit grants
-- - Adds scheduling state for monthly credit grants
-- - Uses pg_cron to process due grants hourly
-- - Supports quarterly / annual memberships by splitting a paid billing period
--   into monthly credit releases
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Reconcile runtime membership / ledger columns that existing code expects
-- ---------------------------------------------------------------------------

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS billing_customer_id text,
  ADD COLUMN IF NOT EXISTS billing_provider text,
  ADD COLUMN IF NOT EXISTS billing_subscription_id text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS last_invoice_id text,
  ADD COLUMN IF NOT EXISTS last_paid_at timestamptz;

ALTER TABLE public.credits_ledger
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS credits_ledger_membership_id_idx
  ON public.credits_ledger(membership_id);

-- ---------------------------------------------------------------------------
-- 2. Scheduled grant rows
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.membership_credit_grants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id         uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id            text,
  billing_period_start  timestamptz NOT NULL,
  billing_period_end    timestamptz NOT NULL,
  grant_month_index     integer NOT NULL DEFAULT 0 CHECK (grant_month_index >= 0),
  grant_month_start     date NOT NULL,
  due_at                timestamptz NOT NULL,
  credits               numeric(8,2) NOT NULL CHECK (credits >= 0),
  processed_credits     numeric(8,2),
  status                text NOT NULL DEFAULT 'scheduled'
                          CHECK (status IN ('scheduled', 'processed', 'skipped', 'canceled')),
  ledger_entry_id       uuid REFERENCES public.credits_ledger(id) ON DELETE SET NULL,
  last_error            text,
  metadata              jsonb,
  processed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_credit_grants_period_order CHECK (billing_period_end > billing_period_start),
  CONSTRAINT membership_credit_grants_due_in_period
    CHECK (due_at >= billing_period_start AND due_at < billing_period_end),
  CONSTRAINT membership_credit_grants_unique_month UNIQUE (membership_id, grant_month_start)
);

CREATE INDEX IF NOT EXISTS membership_credit_grants_status_due_idx
  ON public.membership_credit_grants(status, due_at);

CREATE INDEX IF NOT EXISTS membership_credit_grants_membership_idx
  ON public.membership_credit_grants(membership_id, due_at);

CREATE INDEX IF NOT EXISTS membership_credit_grants_user_idx
  ON public.membership_credit_grants(user_id, due_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_membership_credit_grants_updated_at'
  ) THEN
    CREATE TRIGGER trg_membership_credit_grants_updated_at
      BEFORE UPDATE ON public.membership_credit_grants
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.membership_credit_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membership_credit_grants: own read"
  ON public.membership_credit_grants FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "membership_credit_grants: admin write"
  ON public.membership_credit_grants FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Scheduling helpers
-- ---------------------------------------------------------------------------

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
  v_credit_expiry_days integer := 0;
  v_month_count integer := 1;
  v_index integer;
  v_due_at timestamptz;
  v_grant_month_start date;
  v_rows_changed integer := 0;
  v_last_row_count integer := 0;
  v_reason text := COALESCE('invoice:' || NULLIF(p_invoice_id, ''), 'manual_reschedule');
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

  SELECT v.credits_per_month
    INTO v_credits_per_month
    FROM public.membership_plan_variations v
    WHERE v.tier_id = v_membership.tier
      AND v.cadence = v_membership.cadence
      AND v.provider = 'square'
    ORDER BY v.active DESC, v.sort_order ASC
    LIMIT 1;

  IF v_credits_per_month IS NULL THEN
    RAISE EXCEPTION 'missing plan variation for membership %', p_membership_id;
  END IF;

  SELECT COALESCE((cfg.value #>> '{}')::integer, 0)
    INTO v_credit_expiry_days
    FROM public.system_config cfg
    WHERE cfg.key = 'credit_expiry_days'
    LIMIT 1;

  v_month_count := CASE COALESCE(v_membership.cadence, 'monthly')
    WHEN 'annual' THEN 12
    WHEN 'quarterly' THEN 3
    ELSE 1
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

  FOR v_index IN 0..(v_month_count - 1) LOOP
    v_due_at := p_period_start + make_interval(months => v_index);

    IF v_due_at >= p_period_end THEN
      EXIT;
    END IF;

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
        'credit_expiry_days', v_credit_expiry_days
      ),
      NULL
    )
    ON CONFLICT (membership_id, grant_month_start)
    DO UPDATE
      SET user_id = EXCLUDED.user_id,
          invoice_id = EXCLUDED.invoice_id,
          billing_period_start = EXCLUDED.billing_period_start,
          billing_period_end = EXCLUDED.billing_period_end,
          grant_month_index = EXCLUDED.grant_month_index,
          due_at = EXCLUDED.due_at,
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
  END LOOP;

  RETURN v_rows_changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_pending_membership_credit_grants(
  p_membership_id uuid,
  p_reason text DEFAULT 'membership_inactive',
  p_from timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows_changed integer := 0;
BEGIN
  IF p_membership_id IS NULL THEN
    RAISE EXCEPTION 'membership id is required';
  END IF;

  UPDATE public.membership_credit_grants
     SET status = 'canceled',
         last_error = COALESCE(NULLIF(p_reason, ''), 'membership_inactive'),
         updated_at = now()
   WHERE membership_id = p_membership_id
     AND status = 'scheduled'
     AND due_at >= COALESCE(p_from, now());

  GET DIAGNOSTICS v_rows_changed = ROW_COUNT;
  RETURN v_rows_changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_membership_credit_grants(
  p_membership_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership record;
  v_memberships_backfilled integer := 0;
BEGIN
  FOR v_membership IN
    SELECT m.id, m.current_period_start, m.current_period_end
      FROM public.memberships m
     WHERE (p_membership_id IS NULL OR m.id = p_membership_id)
       AND m.status = 'active'
       AND m.current_period_start IS NOT NULL
       AND m.current_period_end IS NOT NULL
  LOOP
    PERFORM public.schedule_membership_credit_grants(
      v_membership.id,
      NULL,
      v_membership.current_period_start,
      v_membership.current_period_end
    );

    v_memberships_backfilled := v_memberships_backfilled + 1;
  END LOOP;

  RETURN v_memberships_backfilled;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_due_membership_credit_grants(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  processed_count integer,
  skipped_count integer,
  canceled_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant record;
  v_membership public.memberships%ROWTYPE;
  v_max_bank numeric(8,2);
  v_current_balance numeric(8,2);
  v_credit_expiry_days integer := 0;
  v_credit_to_apply numeric(8,2);
  v_ledger_id uuid;
  v_expires_at timestamptz;
BEGIN
  processed_count := 0;
  skipped_count := 0;
  canceled_count := 0;

  SELECT COALESCE((cfg.value #>> '{}')::integer, 0)
    INTO v_credit_expiry_days
    FROM public.system_config cfg
    WHERE cfg.key = 'credit_expiry_days'
    LIMIT 1;

  FOR v_grant IN
    SELECT *
      FROM public.membership_credit_grants
     WHERE status = 'scheduled'
       AND due_at <= now()
     ORDER BY due_at ASC, created_at ASC
     LIMIT GREATEST(COALESCE(p_limit, 100), 1)
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT *
      INTO v_membership
      FROM public.memberships
     WHERE id = v_grant.membership_id;

    IF NOT FOUND THEN
      UPDATE public.membership_credit_grants
         SET status = 'skipped',
             processed_credits = 0,
             processed_at = now(),
             last_error = 'membership_missing'
       WHERE id = v_grant.id;
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    IF COALESCE(v_membership.status, '') <> 'active' THEN
      UPDATE public.membership_credit_grants
         SET status = 'canceled',
             processed_credits = 0,
             processed_at = now(),
             last_error = 'membership_status:' || COALESCE(v_membership.status, 'unknown')
       WHERE id = v_grant.id;
      canceled_count := canceled_count + 1;
      CONTINUE;
    END IF;

    SELECT t.max_bank
      INTO v_max_bank
      FROM public.membership_tiers t
     WHERE t.id = v_membership.tier
     LIMIT 1;

    SELECT COALESCE(SUM(l.delta), 0)
      INTO v_current_balance
      FROM public.credits_ledger l
     WHERE l.user_id = v_grant.user_id
       AND (l.expires_at IS NULL OR l.expires_at > now());

    v_credit_to_apply := v_grant.credits;

    IF v_max_bank IS NOT NULL THEN
      v_credit_to_apply := LEAST(v_credit_to_apply, GREATEST(v_max_bank - v_current_balance, 0));
    END IF;

    IF v_credit_to_apply <= 0 THEN
      UPDATE public.membership_credit_grants
         SET status = 'skipped',
             processed_credits = 0,
             processed_at = now(),
             last_error = 'max_bank_reached'
       WHERE id = v_grant.id;
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    v_expires_at := NULL;
    IF v_credit_expiry_days > 0 THEN
      v_expires_at := v_grant.due_at + make_interval(days => v_credit_expiry_days);
    END IF;

    INSERT INTO public.credits_ledger (
      user_id,
      membership_id,
      delta,
      reason,
      external_ref,
      expires_at,
      metadata
    )
    VALUES (
      v_grant.user_id,
      v_grant.membership_id,
      v_credit_to_apply,
      'subscription_credit_grant',
      COALESCE(v_grant.invoice_id, v_grant.id::text),
      v_expires_at,
      COALESCE(v_grant.metadata, '{}'::jsonb) || jsonb_build_object(
        'membership_credit_grant_id', v_grant.id,
        'scheduled_credits', v_grant.credits,
        'processed_credits', v_credit_to_apply,
        'grant_due_at', v_grant.due_at,
        'grant_month_index', v_grant.grant_month_index,
        'invoice_id', v_grant.invoice_id
      )
    )
    RETURNING id INTO v_ledger_id;

    UPDATE public.membership_credit_grants
       SET status = 'processed',
           processed_credits = v_credit_to_apply,
           processed_at = now(),
           ledger_entry_id = v_ledger_id,
           last_error = CASE
             WHEN v_credit_to_apply < v_grant.credits THEN 'capped_by_max_bank'
             ELSE NULL
           END
     WHERE id = v_grant.id;

    processed_count := processed_count + 1;
  END LOOP;

  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. pg_cron scheduler
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'process-membership-credit-grants'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'process-membership-credit-grants',
    '5 * * * *',
    $cron$SELECT public.process_due_membership_credit_grants(200);$cron$
  );
END $$;
