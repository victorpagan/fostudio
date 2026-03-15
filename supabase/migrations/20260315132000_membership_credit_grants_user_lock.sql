-- =============================================================================
-- Serialize membership credit grant processing per user
-- - Prevent concurrent workers from minting multiple grants against the same
--   pre-grant balance snapshot (which can overrun max_bank caps).
-- - Root case: two scheduled grants for one user processed at the same time
--   by separate workers/processes.
-- =============================================================================

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
    -- Critical: serialize grant processing per user across concurrent workers.
    -- This keeps max_bank calculations deterministic and prevents over-mint.
    PERFORM pg_advisory_xact_lock(hashtext(v_grant.user_id::text));

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
