-- =============================================================================
-- Hold top-ups + paid hold consumption
-- - Adds hold ledger + balance view
-- - Adds hold top-up checkout sessions
-- - Extends booking RPC to optionally consume paid hold credit atomically
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Hold ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hold_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta        integer NOT NULL,
  reason       text NOT NULL
               CHECK (reason IN ('topoff', 'booking_hold', 'admin_adjustment', 'refund', 'expiration')),
  external_ref text,
  expires_at   timestamptz,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hold_ledger_user_id_idx
  ON public.hold_ledger(user_id);

CREATE INDEX IF NOT EXISTS hold_ledger_created_at_idx
  ON public.hold_ledger(user_id, created_at DESC);

CREATE OR REPLACE VIEW public.hold_balance AS
  SELECT
    user_id,
    COALESCE(SUM(delta), 0) AS balance
  FROM public.hold_ledger
  WHERE expires_at IS NULL OR expires_at > now()
  GROUP BY user_id;

ALTER TABLE public.hold_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hold_ledger: own read" ON public.hold_ledger;
CREATE POLICY "hold_ledger: own read"
  ON public.hold_ledger FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "hold_ledger: admin write" ON public.hold_ledger;
CREATE POLICY "hold_ledger: admin write"
  ON public.hold_ledger FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) Hold top-up sessions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hold_topup_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token              text NOT NULL UNIQUE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_id      uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  holds              integer NOT NULL CHECK (holds > 0),
  amount_cents       integer NOT NULL CHECK (amount_cents > 0),
  currency           text NOT NULL DEFAULT 'USD',
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'processed', 'failed', 'expired')),
  payment_provider   text NOT NULL DEFAULT 'square',
  payment_link_id    text,
  order_template_id  text,
  paid_at            timestamptz,
  ledger_entry_id    uuid REFERENCES public.hold_ledger(id) ON DELETE SET NULL,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hold_topup_sessions_user_idx
  ON public.hold_topup_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hold_topup_sessions_status_idx
  ON public.hold_topup_sessions(status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_hold_topup_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_hold_topup_sessions_updated_at
      BEFORE UPDATE ON public.hold_topup_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.hold_topup_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hold_topup_sessions: own read" ON public.hold_topup_sessions;
CREATE POLICY "hold_topup_sessions: own read"
  ON public.hold_topup_sessions FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "hold_topup_sessions: admin write" ON public.hold_topup_sessions;
CREATE POLICY "hold_topup_sessions: admin write"
  ON public.hold_topup_sessions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3) Default hold top-up config
-- ---------------------------------------------------------------------------

INSERT INTO public.system_config (key, value)
VALUES
  ('hold_topup_label', '"Overnight hold add-on"'::jsonb),
  ('hold_topup_price_cents', '2500'::jsonb),
  ('hold_topup_quantity', '1'::jsonb),
  ('hold_credit_cost', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4) Replace booking RPC with paid-hold consumption support
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_confirmed_booking_with_burn(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text,
  boolean,
  numeric
);

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
    v_hold_start := p_end_time;
    v_hold_end   := ((p_end_time AT TIME ZONE 'America/Los_Angeles')::date
                      + INTERVAL '1 day'
                      + INTERVAL '10 hours')
                      AT TIME ZONE 'America/Los_Angeles';

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
