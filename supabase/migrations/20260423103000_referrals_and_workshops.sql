-- Referral rewards + workshop booking mode

CREATE TABLE IF NOT EXISTS public.member_referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_referral_codes_code_format_check
    CHECK (code = upper(btrim(code)) AND code ~ '^[A-Z0-9]{6,16}$')
);

CREATE INDEX IF NOT EXISTS member_referral_codes_code_active_idx
  ON public.member_referral_codes (code, active);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_member_referral_codes_updated_at'
  ) THEN
    CREATE TRIGGER trg_member_referral_codes_updated_at
      BEFORE UPDATE ON public.member_referral_codes
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.member_referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "member_referral_codes_owner_select" ON public.member_referral_codes;
CREATE POLICY "member_referral_codes_owner_select"
  ON public.member_referral_codes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "member_referral_codes_staff_all" ON public.member_referral_codes;
CREATE POLICY "member_referral_codes_staff_all"
  ON public.member_referral_codes
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

CREATE TABLE IF NOT EXISTS public.membership_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_session_id uuid NOT NULL UNIQUE REFERENCES public.membership_checkout_sessions(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  referrer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awarded', 'rejected')),
  rejection_reason text,
  referrer_credits_awarded numeric(8,2) NOT NULL DEFAULT 0 CHECK (referrer_credits_awarded >= 0),
  referred_credits_awarded numeric(8,2) NOT NULL DEFAULT 0 CHECK (referred_credits_awarded >= 0),
  awarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS membership_referrals_referrer_idx
  ON public.membership_referrals (referrer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS membership_referrals_referred_idx
  ON public.membership_referrals (referred_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS membership_referrals_referred_awarded_unique
  ON public.membership_referrals (referred_user_id)
  WHERE status = 'awarded' AND referred_user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_membership_referrals_updated_at'
  ) THEN
    CREATE TRIGGER trg_membership_referrals_updated_at
      BEFORE UPDATE ON public.membership_referrals
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.membership_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "membership_referrals_staff_all" ON public.membership_referrals;
CREATE POLICY "membership_referrals_staff_all"
  ON public.membership_referrals
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

CREATE TABLE IF NOT EXISTS public.referral_credit_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id text NOT NULL REFERENCES public.membership_tiers(id) ON DELETE CASCADE,
  cadence text NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  referrer_credits numeric(8,2) NOT NULL CHECK (referrer_credits >= 0),
  referred_credits numeric(8,2) NOT NULL CHECK (referred_credits >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_id, cadence)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_referral_credit_rules_updated_at'
  ) THEN
    CREATE TRIGGER trg_referral_credit_rules_updated_at
      BEFORE UPDATE ON public.referral_credit_rules
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.referral_credit_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_credit_rules_staff_all" ON public.referral_credit_rules;
CREATE POLICY "referral_credit_rules_staff_all"
  ON public.referral_credit_rules
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

INSERT INTO public.referral_credit_rules (
  tier_id,
  cadence,
  referrer_credits,
  referred_credits
)
SELECT
  mpv.tier_id,
  mpv.cadence,
  CASE
    WHEN mpv.cadence IN ('quarterly', 'annual') THEN 3
    WHEN mpv.tier_id IN ('pro', 'studio_plus') THEN 3
    ELSE 1
  END,
  CASE
    WHEN mpv.cadence IN ('quarterly', 'annual') THEN 3
    WHEN mpv.tier_id IN ('pro', 'studio_plus') THEN 3
    ELSE 1
  END
FROM public.membership_plan_variations AS mpv
WHERE mpv.provider = 'square'
  AND mpv.cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')
GROUP BY mpv.tier_id, mpv.cadence
ON CONFLICT (tier_id, cadence) DO NOTHING;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS workshop_booking_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_kind text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS workshop_title text,
  ADD COLUMN IF NOT EXISTS workshop_description text,
  ADD COLUMN IF NOT EXISTS workshop_link text,
  ADD COLUMN IF NOT EXISTS workshop_liability_accepted_at timestamptz;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_booking_kind_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_kind_check
  CHECK (booking_kind IN ('standard', 'workshop'));

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_workshop_liability_required_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_workshop_liability_required_check
  CHECK (
    booking_kind <> 'workshop'
    OR workshop_liability_accepted_at IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS bookings_workshop_upcoming_idx
  ON public.bookings (start_time ASC)
  WHERE booking_kind = 'workshop' AND status IN ('confirmed', 'requested');

INSERT INTO public.system_config (key, value)
VALUES ('workshop_credit_multiplier', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_confirmed_booking_with_burn(
  p_user_id uuid,
  p_customer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_notes text,
  p_request_hold boolean,
  p_credits_needed numeric,
  p_consume_paid_hold boolean DEFAULT false,
  p_hold_credit_cost numeric DEFAULT 0,
  p_booking_kind text DEFAULT 'standard',
  p_workshop_title text DEFAULT NULL,
  p_workshop_description text DEFAULT NULL,
  p_workshop_link text DEFAULT NULL,
  p_workshop_liability_accepted_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  booking_id uuid,
  hold_id uuid,
  credits_burned numeric,
  new_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_hold_id uuid;
  v_balance numeric;
  v_burned numeric;
  v_hold_start timestamptz;
  v_hold_end timestamptz;
  v_membership_id uuid;
  v_hold_balance integer;
  v_extra_hold_credits numeric;
  v_total_burn numeric;
  v_hold_end_8am timestamptz;
  v_balance_debt numeric := 0;
  v_remaining_burn numeric := 0;
  v_consume numeric := 0;
  v_post_balance numeric := 0;
  v_ledger_row record;
  v_lot_row record;
BEGIN
  SELECT m.id
    INTO v_membership_id
    FROM public.memberships m
   WHERE m.user_id = p_user_id
   LIMIT 1
   FOR UPDATE;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'Membership required for user %', p_user_id;
  END IF;

  IF p_booking_kind NOT IN ('standard', 'workshop') THEN
    RAISE EXCEPTION 'Invalid booking kind';
  END IF;

  IF p_booking_kind = 'workshop' AND p_workshop_liability_accepted_at IS NULL THEN
    RAISE EXCEPTION 'Workshop liability acknowledgement is required';
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
    lot_id bigserial PRIMARY KEY,
    bucket text NOT NULL,
    expires_at timestamptz,
    created_at timestamptz NOT NULL,
    remaining numeric NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE TABLE pg_temp.credit_lot_state;

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
    user_id,
    customer_id,
    start_time,
    end_time,
    status,
    notes,
    credits_estimated,
    credits_burned,
    booking_kind,
    workshop_title,
    workshop_description,
    workshop_link,
    workshop_liability_accepted_at
  )
  VALUES (
    p_user_id,
    p_customer_id,
    p_start_time,
    p_end_time,
    'confirmed',
    p_notes,
    v_total_burn,
    v_total_burn,
    p_booking_kind,
    NULLIF(btrim(COALESCE(p_workshop_title, '')), ''),
    NULLIF(btrim(COALESCE(p_workshop_description, '')), ''),
    NULLIF(btrim(COALESCE(p_workshop_link, '')), ''),
    p_workshop_liability_accepted_at
  )
  RETURNING id INTO v_booking_id;

  v_burned := v_total_burn;
  v_remaining_burn := v_burned;

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
        'source_bucket', v_lot_row.bucket,
        'booking_kind', p_booking_kind
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

  RETURN QUERY
  SELECT
    v_booking_id,
    v_hold_id,
    v_burned,
    v_post_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_confirmed_booking_with_burn_no_membership(
  p_user_id uuid,
  p_customer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_notes text,
  p_credits_needed numeric,
  p_booking_kind text DEFAULT 'standard',
  p_workshop_title text DEFAULT NULL,
  p_workshop_description text DEFAULT NULL,
  p_workshop_link text DEFAULT NULL,
  p_workshop_liability_accepted_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  booking_id uuid,
  credits_burned numeric,
  new_balance numeric
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
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  IF p_booking_kind NOT IN ('standard', 'workshop') THEN
    RAISE EXCEPTION 'Invalid booking kind';
  END IF;

  IF p_booking_kind = 'workshop' AND p_workshop_liability_accepted_at IS NULL THEN
    RAISE EXCEPTION 'Workshop liability acknowledgement is required';
  END IF;

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
    credits_burned,
    booking_kind,
    workshop_title,
    workshop_description,
    workshop_link,
    workshop_liability_accepted_at
  )
  VALUES (
    p_user_id,
    p_customer_id,
    p_start_time,
    p_end_time,
    'confirmed',
    p_notes,
    v_needed,
    v_needed,
    p_booking_kind,
    NULLIF(btrim(COALESCE(p_workshop_title, '')), ''),
    NULLIF(btrim(COALESCE(p_workshop_description, '')), ''),
    NULLIF(btrim(COALESCE(p_workshop_link, '')), ''),
    p_workshop_liability_accepted_at
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
      'booking_id', v_booking_id,
      'booking_kind', p_booking_kind
    )
  );

  RETURN QUERY
  SELECT
    v_booking_id,
    v_needed,
    v_balance - v_needed;
END;
$$;
