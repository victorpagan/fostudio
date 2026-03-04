-- =============================================================================
-- Fix booking burn RPC row locking
-- - Postgres does not allow FOR UPDATE on aggregate queries.
-- - Replace create_confirmed_booking_with_burn with a valid lock strategy.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_confirmed_booking_with_burn(
  p_user_id        uuid,
  p_customer_id    uuid,
  p_start_time     timestamptz,
  p_end_time       timestamptz,
  p_notes          text,
  p_request_hold   boolean,
  p_credits_needed numeric
)
RETURNS TABLE (
  booking_id     uuid,
  hold_id        uuid,
  credits_burned numeric,
  new_balance    numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id     uuid;
  v_hold_id        uuid;
  v_balance        numeric;
  v_burned         numeric;
  v_hold_start     timestamptz;
  v_hold_end       timestamptz;
  v_membership_id  uuid;
BEGIN
  -- Serialize booking burns per-user by locking the membership row.
  SELECT m.id
    INTO v_membership_id
    FROM public.memberships m
   WHERE m.user_id = p_user_id
   LIMIT 1
   FOR UPDATE;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'Membership required for user %', p_user_id;
  END IF;

  -- Current available balance (ignoring expired credits).
  SELECT COALESCE(SUM(l.delta), 0)
    INTO v_balance
    FROM public.credits_ledger l
   WHERE l.user_id = p_user_id
     AND (l.expires_at IS NULL OR l.expires_at > now());

  IF v_balance < p_credits_needed THEN
    RAISE EXCEPTION 'Insufficient credits: have %, need %', v_balance, p_credits_needed;
  END IF;

  -- Insert booking; exclusion constraints guard overlap.
  INSERT INTO public.bookings (
    user_id, customer_id, start_time, end_time,
    status, notes, credits_estimated, credits_burned,
    time_range
  )
  VALUES (
    p_user_id, p_customer_id, p_start_time, p_end_time,
    'confirmed', p_notes, p_credits_needed, p_credits_needed,
    tstzrange(p_start_time, p_end_time, '[)')
  )
  RETURNING id INTO v_booking_id;

  -- Burn credits (fractional amounts supported).
  v_burned := p_credits_needed;
  INSERT INTO public.credits_ledger (user_id, delta, reason, external_ref)
  VALUES (p_user_id, -v_burned, 'booking_burn', v_booking_id::text);

  -- Optional overnight hold (ends next day 10am LA).
  IF p_request_hold THEN
    v_hold_start := p_end_time;
    v_hold_end   := ((p_end_time AT TIME ZONE 'America/Los_Angeles')::date
                      + INTERVAL '1 day'
                      + INTERVAL '10 hours')
                      AT TIME ZONE 'America/Los_Angeles';

    INSERT INTO public.booking_holds (booking_id, hold_start, hold_end, hold_type, hold_range)
    VALUES (
      v_booking_id,
      v_hold_start,
      v_hold_end,
      'overnight',
      tstzrange(v_hold_start, v_hold_end, '[)')
    )
    RETURNING id INTO v_hold_id;
  END IF;

  -- Return post-burn balance.
  SELECT COALESCE(SUM(l.delta), 0)
    INTO v_balance
    FROM public.credits_ledger l
   WHERE l.user_id = p_user_id
     AND (l.expires_at IS NULL OR l.expires_at > now());

  RETURN QUERY SELECT v_booking_id, v_hold_id, v_burned, v_balance;
END;
$$;
