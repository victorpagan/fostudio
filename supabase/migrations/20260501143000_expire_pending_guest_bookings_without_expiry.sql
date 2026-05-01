CREATE OR REPLACE FUNCTION public.expire_stale_pending_guest_bookings(
  p_now timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.bookings
     SET status = 'canceled',
         updated_at = now(),
         rate_policy_snapshot = COALESCE(rate_policy_snapshot, '{}'::jsonb)
           || jsonb_build_object('expired_pending_payment_at', p_now)
   WHERE status = 'pending_payment'
     AND (
       payment_expires_at IS NULL
       OR payment_expires_at <= p_now
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_pending_guest_bookings(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_guest_bookings(timestamptz) TO service_role;
