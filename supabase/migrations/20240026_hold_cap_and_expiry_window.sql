-- =============================================================================
-- Hold cap + overnight hold expiry alignment
-- - Align default monthly hold caps for core tiers
-- - Make hold end the earlier of:
--   1) next-day 10:00 AM PT
--   2) next-day configured peak start hour PT
-- =============================================================================

UPDATE public.membership_tiers
SET holds_included = CASE id
  WHEN 'creator' THEN 1
  WHEN 'pro' THEN 3
  WHEN 'studio_plus' THEN 6
  ELSE holds_included
END
WHERE id IN ('creator', 'pro', 'studio_plus');

CREATE OR REPLACE FUNCTION public.create_confirmed_booking_with_burn(
  p_user_id            uuid,
  p_customer_id        uuid,
  p_start_time         timestamptz,
  p_end_time           timestamptz,
  p_notes              text,
  p_request_hold       boolean,
  p_credits_needed     numeric,
  p_consume_paid_hold  boolean DEFAULT false,
  p_hold_credit_cost   numeric DEFAULT 0
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
  v_hold_balance   integer;
  v_extra_hold_credits numeric;
  v_total_burn        numeric;
  v_peak_start_hour   integer := 11;
  v_hold_end_10am     timestamptz;
  v_hold_end_peak     timestamptz;
BEGIN
  -- Serialize booking burns per-user by locking membership row.
  SELECT m.id
    INTO v_membership_id
    FROM public.memberships m
   WHERE m.user_id = p_user_id
   LIMIT 1
   FOR UPDATE;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'Membership required for user %', p_user_id;
  END IF;

  SELECT COALESCE(SUM(l.delta), 0)
    INTO v_balance
    FROM public.credits_ledger l
   WHERE l.user_id = p_user_id
     AND (l.expires_at IS NULL OR l.expires_at > now());

  IF p_consume_paid_hold AND NOT p_request_hold THEN
    RAISE EXCEPTION 'Paid hold consumption requires request_hold=true';
  END IF;

  IF p_hold_credit_cost < 0 THEN
    RAISE EXCEPTION 'Invalid hold credit cost';
  END IF;

  IF p_hold_credit_cost > 0 AND NOT p_request_hold THEN
    RAISE EXCEPTION 'Hold credit cost requires request_hold=true';
  END IF;

  v_extra_hold_credits := CASE
    WHEN p_request_hold THEN GREATEST(p_hold_credit_cost, 0)
    ELSE 0
  END;
  v_total_burn := p_credits_needed + v_extra_hold_credits;

  IF v_balance < v_total_burn THEN
    RAISE EXCEPTION 'Insufficient credits: have %, need %', v_balance, v_total_burn;
  END IF;

  IF p_consume_paid_hold THEN
    SELECT COALESCE(SUM(h.delta), 0)
      INTO v_hold_balance
      FROM public.hold_ledger h
     WHERE h.user_id = p_user_id
       AND (h.expires_at IS NULL OR h.expires_at > now());

    IF v_hold_balance < 1 THEN
      RAISE EXCEPTION 'Insufficient hold credits';
    END IF;
  END IF;

  INSERT INTO public.bookings (
    user_id, customer_id, start_time, end_time,
    status, notes, credits_estimated, credits_burned
  )
  VALUES (
    p_user_id, p_customer_id, p_start_time, p_end_time,
    'confirmed', p_notes, v_total_burn, v_total_burn
  )
  RETURNING id INTO v_booking_id;

  v_burned := v_total_burn;
  INSERT INTO public.credits_ledger (user_id, delta, reason, external_ref)
  VALUES (p_user_id, -v_burned, 'booking_burn', v_booking_id::text);

  IF p_request_hold THEN
    SELECT COALESCE((cfg.value #>> '{}')::integer, 11)
      INTO v_peak_start_hour
      FROM public.system_config cfg
     WHERE cfg.key = 'peak_start_hour'
     LIMIT 1;

    v_peak_start_hour := GREATEST(0, LEAST(v_peak_start_hour, 23));

    v_hold_start := p_end_time;
    v_hold_end_10am := ((p_end_time AT TIME ZONE 'America/Los_Angeles')::date
                        + INTERVAL '1 day'
                        + INTERVAL '10 hours')
                        AT TIME ZONE 'America/Los_Angeles';
    v_hold_end_peak := (((p_end_time AT TIME ZONE 'America/Los_Angeles')::date
                        + INTERVAL '1 day')
                        + make_interval(hours => v_peak_start_hour))
                        AT TIME ZONE 'America/Los_Angeles';
    v_hold_end := LEAST(v_hold_end_10am, v_hold_end_peak);

    INSERT INTO public.booking_holds (booking_id, hold_start, hold_end, hold_type)
    VALUES (v_booking_id, v_hold_start, v_hold_end, 'overnight')
    RETURNING id INTO v_hold_id;
  END IF;

  IF p_consume_paid_hold THEN
    INSERT INTO public.hold_ledger (user_id, delta, reason, external_ref, metadata)
    VALUES (
      p_user_id,
      -1,
      'booking_hold',
      v_booking_id::text,
      jsonb_build_object(
        'source', 'booking_create',
        'booking_id', v_booking_id,
        'hold_id', v_hold_id
      )
    );
  END IF;

  SELECT COALESCE(SUM(l.delta), 0)
    INTO v_balance
    FROM public.credits_ledger l
   WHERE l.user_id = p_user_id
     AND (l.expires_at IS NULL OR l.expires_at > now());

  RETURN QUERY SELECT v_booking_id, v_hold_id, v_burned, v_balance;
END;
$$;
