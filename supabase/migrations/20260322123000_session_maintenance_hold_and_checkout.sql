-- =============================================================================
-- Session maintenance: hold top-ups + membership checkout
-- - Expires stale pending sessions instead of deleting
-- - Keeps rows for audit/recovery and allows late reconciliation
-- =============================================================================

CREATE OR REPLACE FUNCTION public.expire_stale_hold_topup_sessions(
  p_max_age interval DEFAULT interval '7 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count integer := 0;
BEGIN
  UPDATE public.hold_topup_sessions s
     SET status = 'expired',
         updated_at = now(),
         metadata = COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object(
           'expired_at', now(),
           'expired_reason', 'stale_pending_timeout',
           'expired_max_age', p_max_age::text
         )
   WHERE s.status = 'pending'
     AND s.created_at < now() - p_max_age;

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN v_expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_hold_topup_sessions(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_hold_topup_sessions(interval) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_stale_membership_checkout_sessions(
  p_max_age interval DEFAULT interval '30 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count integer := 0;
BEGIN
  -- Only expire unpaid pending sessions so paid-but-unclaimed checkouts
  -- remain recoverable by the claim flow.
  UPDATE public.membership_checkout_sessions s
     SET status = 'expired',
         updated_at = now(),
         metadata = COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object(
           'expired_at', now(),
           'expired_reason', 'stale_unpaid_pending_timeout',
           'expired_max_age', p_max_age::text
         )
   WHERE s.status = 'pending'
     AND s.paid_at IS NULL
     AND s.created_at < now() - p_max_age;

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN v_expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_membership_checkout_sessions(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_membership_checkout_sessions(interval) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RETURN;
  END IF;

  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'expire-stale-hold-topup-sessions'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire-stale-hold-topup-sessions',
    '23 * * * *',
    $cron$SELECT public.expire_stale_hold_topup_sessions('7 days'::interval);$cron$
  );

  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'expire-stale-membership-checkout-sessions'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire-stale-membership-checkout-sessions',
    '29 * * * *',
    $cron$SELECT public.expire_stale_membership_checkout_sessions('30 days'::interval);$cron$
  );
END $$;
