-- =============================================================================
-- Credits-only booking RPC
-- - Allows booking/burn for users without a membership row, as long as they
--   still have unexpired credits.
-- - Used for legacy/admin edge-cases where balance exists but membership is inactive/missing.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_confirmed_booking_with_burn_no_membership(
  p_user_id        uuid,
  p_customer_id    uuid,
  p_start_time     timestamptz,
  p_end_time       timestamptz,
  p_notes          text,
  p_credits_needed numeric
)
RETURNS TABLE (
  booking_id     uuid,
  credits_burned numeric,
  new_balance    numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_balance numeric;
  v_needed numeric := GREATEST(COALESCE(p_credits_needed, 0), 0);
BEGIN
  -- Serialize credits-only burns per user.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT COALESCE(SUM(l.delta), 0)
    INTO v_balance
    FROM public.credits_ledger l
   WHERE l.user_id = p_user_id
     AND (l.expires_at IS NULL OR l.expires_at > now());

  IF v_balance < v_needed THEN
    RAISE EXCEPTION 'Insufficient credits: have %, need %', v_balance, v_needed;
  END IF;

  INSERT INTO public.bookings (
    user_id,
    customer_id,
    start_time,
    end_time,
    status,
    notes,
    credits_estimated,
    credits_burned
  )
  VALUES (
    p_user_id,
    p_customer_id,
    p_start_time,
    p_end_time,
    'confirmed',
    p_notes,
    v_needed,
    v_needed
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.credits_ledger (
    user_id,
    membership_id,
    delta,
    reason,
    external_ref,
    metadata
  )
  VALUES (
    p_user_id,
    NULL,
    -v_needed,
    'booking_burn',
    v_booking_id::text || ':credits_only',
    jsonb_build_object(
      'source', 'booking_create_no_membership',
      'booking_id', v_booking_id
    )
  );

  RETURN QUERY
  SELECT
    v_booking_id,
    v_needed,
    v_balance - v_needed;
END;
$$;
