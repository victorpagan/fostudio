-- =============================================================================
-- Fix schedule_membership_credit_grants type mismatch
-- - Some environments use enum public.membership_tier for memberships.tier.
-- - membership_plan_variations.tier_id is text.
-- - Compare as text to avoid: operator does not exist: text = membership_tier
-- =============================================================================

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
    WHERE v.tier_id = v_membership.tier::text
      AND v.cadence = v_membership.cadence::text
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

  v_month_count := CASE COALESCE(v_membership.cadence::text, 'monthly')
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
