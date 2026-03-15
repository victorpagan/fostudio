-- =============================================================================
-- Hold policy update for booking RPC:
-- - Overnight hold eligibility requires:
--   1) minimum 4-hour booking duration
--   2) booking end time at or after 6:00 PM America/Los_Angeles
-- - Overnight holds now end at 8:00 AM next day (fixed), not peak-start/10am.
-- =============================================================================

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
  v_hold_end_8am      timestamptz;
  v_balance_debt      numeric := 0;
  v_remaining_burn    numeric := 0;
  v_consume           numeric := 0;
  v_post_balance      numeric := 0;
  v_ledger_row        record;
  v_lot_row           record;
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

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.credit_lot_state (
    lot_id      bigserial PRIMARY KEY,
    bucket      text NOT NULL,
    expires_at  timestamptz,
    created_at  timestamptz NOT NULL,
    remaining   numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE TABLE pg_temp.credit_lot_state;

  -- Rebuild active lot state from ledger. Negative deltas consume earliest-expiring lots.
  FOR v_ledger_row IN
    SELECT l.id, l.delta, l.reason, l.expires_at, l.created_at
      FROM public.credits_ledger l
     WHERE l.user_id = p_user_id
       AND (l.expires_at IS NULL OR l.expires_at > now())
     ORDER BY l.created_at ASC, l.id ASC
     FOR UPDATE
  LOOP
    IF v_ledger_row.delta > 0 THEN
      INSERT INTO pg_temp.credit_lot_state (bucket, expires_at, created_at, remaining)
      VALUES (
        CASE WHEN COALESCE(v_ledger_row.reason, '') = 'topoff' THEN 'topoff' ELSE 'bank' END,
        v_ledger_row.expires_at,
        COALESCE(v_ledger_row.created_at, now()),
        v_ledger_row.delta
      );
      CONTINUE;
    END IF;

    IF v_ledger_row.delta >= 0 THEN
      CONTINUE;
    END IF;

    v_remaining_burn := ABS(v_ledger_row.delta);
    WHILE v_remaining_burn > 0 LOOP
      SELECT lot_id, remaining
        INTO v_lot_row
        FROM pg_temp.credit_lot_state
       WHERE remaining > 0
       ORDER BY
         CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END,
         expires_at NULLS LAST,
         created_at ASC,
         lot_id ASC
       LIMIT 1
       FOR UPDATE;

      IF NOT FOUND THEN
        v_balance_debt := v_balance_debt + v_remaining_burn;
        v_remaining_burn := 0;
        EXIT;
      END IF;

      v_consume := LEAST(v_lot_row.remaining, v_remaining_burn);

      UPDATE pg_temp.credit_lot_state
         SET remaining = remaining - v_consume
       WHERE lot_id = v_lot_row.lot_id;

      v_remaining_burn := v_remaining_burn - v_consume;
    END LOOP;
  END LOOP;

  SELECT COALESCE(SUM(remaining), 0) - v_balance_debt
    INTO v_balance
    FROM pg_temp.credit_lot_state;

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
  v_remaining_burn := v_burned;

  -- Consume the new burn from earliest-expiring lots.
  WHILE v_remaining_burn > 0 LOOP
    SELECT lot_id, bucket, remaining, expires_at
      INTO v_lot_row
      FROM pg_temp.credit_lot_state
     WHERE remaining > 0
     ORDER BY
       CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END,
       expires_at NULLS LAST,
       created_at ASC,
       lot_id ASC
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
      -- Fallback for historical debt edge-cases.
      INSERT INTO public.credits_ledger (user_id, membership_id, delta, reason, external_ref)
      VALUES (
        p_user_id,
        v_membership_id,
        -v_remaining_burn,
        'booking_burn',
        v_booking_id::text || ':debt'
      );
      v_balance_debt := v_balance_debt + v_remaining_burn;
      v_remaining_burn := 0;
      EXIT;
    END IF;

    v_consume := LEAST(v_lot_row.remaining, v_remaining_burn);

    UPDATE pg_temp.credit_lot_state
       SET remaining = remaining - v_consume
     WHERE lot_id = v_lot_row.lot_id;

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
      p_user_id,
      v_membership_id,
      -v_consume,
      'booking_burn',
      v_booking_id::text || ':' || v_lot_row.lot_id::text,
      v_lot_row.expires_at,
      jsonb_build_object(
        'source', 'booking_create',
        'booking_id', v_booking_id,
        'allocation', 'earliest_expiry_first',
        'source_bucket', v_lot_row.bucket
      )
    );

    v_remaining_burn := v_remaining_burn - v_consume;
  END LOOP;

  IF p_request_hold THEN
    IF p_end_time < p_start_time + INTERVAL '4 hours' THEN
      RAISE EXCEPTION 'Overnight holds require a minimum booking length of 4 hours.';
    END IF;

    IF ((p_end_time AT TIME ZONE 'America/Los_Angeles')::time < TIME '18:00:00') THEN
      RAISE EXCEPTION 'Overnight holds require booking end time at or after 6:00 PM.';
    END IF;

    v_hold_start := p_end_time;
    v_hold_end_8am := ((p_end_time AT TIME ZONE 'America/Los_Angeles')::date
                       + INTERVAL '1 day'
                       + INTERVAL '8 hours')
                       AT TIME ZONE 'America/Los_Angeles';
    v_hold_end := v_hold_end_8am;

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

  SELECT COALESCE(SUM(remaining), 0) - v_balance_debt
    INTO v_post_balance
    FROM pg_temp.credit_lot_state;

  RETURN QUERY SELECT v_booking_id, v_hold_id, v_burned, v_post_balance;
END;
$$;
