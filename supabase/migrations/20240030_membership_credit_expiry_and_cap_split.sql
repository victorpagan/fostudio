-- =============================================================================
-- Per-tier credit expiry + max-bank split (membership credits vs top-offs)
-- - membership_tiers.credit_expiry_days defaults to 90
-- - membership_tiers.topoff_credit_expiry_days defaults to 30
-- - grant capping uses non-topoff credits so top-offs do not block plan grants
-- =============================================================================

ALTER TABLE public.membership_tiers
  ADD COLUMN IF NOT EXISTS credit_expiry_days integer,
  ADD COLUMN IF NOT EXISTS topoff_credit_expiry_days integer;

UPDATE public.membership_tiers
   SET credit_expiry_days = 90
 WHERE credit_expiry_days IS NULL;

UPDATE public.membership_tiers
   SET topoff_credit_expiry_days = 30
 WHERE topoff_credit_expiry_days IS NULL;

ALTER TABLE public.membership_tiers
  ALTER COLUMN credit_expiry_days SET DEFAULT 90,
  ALTER COLUMN credit_expiry_days SET NOT NULL,
  ALTER COLUMN topoff_credit_expiry_days SET DEFAULT 30,
  ALTER COLUMN topoff_credit_expiry_days SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'membership_tiers_credit_expiry_days_check'
      AND conrelid = 'public.membership_tiers'::regclass
  ) THEN
    ALTER TABLE public.membership_tiers
      ADD CONSTRAINT membership_tiers_credit_expiry_days_check
      CHECK (credit_expiry_days >= 1 AND credit_expiry_days <= 3650);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'membership_tiers_topoff_credit_expiry_days_check'
      AND conrelid = 'public.membership_tiers'::regclass
  ) THEN
    ALTER TABLE public.membership_tiers
      ADD CONSTRAINT membership_tiers_topoff_credit_expiry_days_check
      CHECK (topoff_credit_expiry_days >= 1 AND topoff_credit_expiry_days <= 3650);
  END IF;
END $$;

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
    WHERE v.tier_id = v_membership.tier::text
      AND v.cadence = v_membership.cadence::text
      AND v.provider = 'square'
    ORDER BY v.active DESC, v.sort_order ASC
    LIMIT 1;

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
        'credit_expiry_days', v_credit_expiry_days
      ),
      NULL
    )
    ON CONFLICT (membership_id, due_at)
    DO UPDATE
      SET user_id = EXCLUDED.user_id,
          invoice_id = EXCLUDED.invoice_id,
          billing_period_start = EXCLUDED.billing_period_start,
          billing_period_end = EXCLUDED.billing_period_end,
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
  v_default_credit_expiry_days integer := 90;
  v_tier_credit_expiry_days integer := 0;
  v_credit_to_apply numeric(8,2);
  v_ledger_id uuid;
  v_expires_at timestamptz;
BEGIN
  processed_count := 0;
  skipped_count := 0;
  canceled_count := 0;

  SELECT COALESCE((cfg.value #>> '{}')::integer, 90)
    INTO v_default_credit_expiry_days
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

    IF COALESCE(v_membership.status::text, '') <> 'active' THEN
      UPDATE public.membership_credit_grants
         SET status = 'canceled',
             processed_credits = 0,
             processed_at = now(),
             last_error = 'membership_status:' || COALESCE(v_membership.status::text, 'unknown')
       WHERE id = v_grant.id;
      canceled_count := canceled_count + 1;
      CONTINUE;
    END IF;

    SELECT
      t.max_bank,
      COALESCE(t.credit_expiry_days, 0)
      INTO v_max_bank, v_tier_credit_expiry_days
      FROM public.membership_tiers t
     WHERE t.id = v_membership.tier::text
     LIMIT 1;

    SELECT COALESCE(SUM(l.delta), 0)
      INTO v_current_balance
      FROM public.credits_ledger l
     WHERE l.user_id = v_grant.user_id
       AND COALESCE(l.reason, '') <> 'topoff'
       AND NOT (
         COALESCE(l.reason, '') = 'booking_burn'
         AND COALESCE(l.metadata->>'source_bucket', '') = 'topoff'
       )
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
    IF COALESCE(v_tier_credit_expiry_days, 0) > 0 THEN
      v_expires_at := v_grant.due_at + make_interval(days => v_tier_credit_expiry_days);
    ELSIF COALESCE(v_default_credit_expiry_days, 0) > 0 THEN
      v_expires_at := v_grant.due_at + make_interval(days => v_default_credit_expiry_days);
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
