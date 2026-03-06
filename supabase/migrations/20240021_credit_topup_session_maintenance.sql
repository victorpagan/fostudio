-- =============================================================================
-- Credit top-up session maintenance
-- - Expires stale pending sessions instead of deleting
-- - Keeps rows for audit/recovery and allows late reconciliation
-- =============================================================================

CREATE OR REPLACE FUNCTION public.expire_stale_credit_topup_sessions(
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
  UPDATE public.credit_topup_sessions s
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

REVOKE ALL ON FUNCTION public.expire_stale_credit_topup_sessions(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_credit_topup_sessions(interval) TO service_role;

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
   WHERE jobname = 'expire-stale-credit-topup-sessions'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire-stale-credit-topup-sessions',
    '17 * * * *',
    $cron$SELECT public.expire_stale_credit_topup_sessions('7 days'::interval);$cron$
  );
END $$;
