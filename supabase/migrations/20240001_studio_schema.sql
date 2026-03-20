-- =============================================================================
-- FO Studio — Core Schema Migration
-- Run this in Supabase SQL editor or via: supabase db push
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend customers table with studio-specific fields
--    The base customers table already exists from the prior project.
--    We add the columns the studio code expects.
-- ---------------------------------------------------------------------------

-- Give the id column a default if it doesn't already have one.
-- The remote customers table has id of type uuid, so we use gen_random_uuid() directly.
ALTER TABLE public.customers
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS first_name           text,
  ADD COLUMN IF NOT EXISTS last_name            text,
  ADD COLUMN IF NOT EXISTS square_customer_id   text,
  ADD COLUMN IF NOT EXISTS square_customer_json jsonb;

-- ---------------------------------------------------------------------------
-- 2. Membership tiers catalog (DB-driven, no hardcoding)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.membership_tiers (
  id                  text PRIMARY KEY,          -- 'creator' | 'pro' | 'studio_plus'
  display_name        text        NOT NULL,
  description         text,
  booking_window_days integer     NOT NULL DEFAULT 30,
  peak_multiplier     numeric(4,2) NOT NULL DEFAULT 1.5,
  max_bank            integer,                   -- max credits a member can hold
  max_slots           integer,                   -- max members in this tier (NULL = unlimited)
  holds_included      integer     NOT NULL DEFAULT 0,
  active              boolean     NOT NULL DEFAULT true,
  visible             boolean     NOT NULL DEFAULT true,
  sort_order          integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Plan variations per tier (cadence × provider)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.membership_plan_variations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id                  text NOT NULL REFERENCES public.membership_tiers(id),
  cadence                  text NOT NULL CHECK (cadence IN ('monthly','quarterly','annual')),
  provider                 text NOT NULL DEFAULT 'square',  -- 'square' | 'stripe'
  provider_plan_variation_id text,                          -- Square plan variation ID
  credits_per_month        integer NOT NULL,
  price_cents              integer NOT NULL,
  currency                 text    NOT NULL DEFAULT 'USD',
  discount_label           text,                            -- e.g. 'Save 15%'
  active                   boolean NOT NULL DEFAULT true,
  visible                  boolean NOT NULL DEFAULT true,
  sort_order               integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_id, cadence, provider)
);

-- ---------------------------------------------------------------------------
-- 4. Memberships — one row per user (active subscription state)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.memberships (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                        text REFERENCES public.membership_tiers(id),
  cadence                     text CHECK (cadence IN ('monthly','quarterly','annual')),
  status                      text NOT NULL DEFAULT 'pending_checkout'
                                CHECK (status IN (
                                  'pending_checkout','active','past_due',
                                  'canceled','inactive','paused'
                                )),
  -- Square subscription tracking
  square_subscription_id      text,
  square_plan_variation_id    text,
  square_customer_id          text,
  -- Checkout session tracking
  checkout_provider           text,
  checkout_payment_link_id    text,
  checkout_order_template_id  text,
  -- Timestamps
  activated_at                timestamptz,
  canceled_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)             -- one membership row per user
);

CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS memberships_status_idx  ON public.memberships(status);
CREATE INDEX IF NOT EXISTS memberships_tier_idx    ON public.memberships(tier);

-- ---------------------------------------------------------------------------
-- 5. Credits ledger — immutable event log, balance = SUM(delta)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.credits_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta        numeric(8,2) NOT NULL,           -- positive = credit, negative = debit
  reason       text NOT NULL,                   -- 'subscription_invoice_paid' | 'booking_burn' | 'topoff' | 'expiration' | 'admin_adjustment' | 'refund'
  external_ref text,                            -- invoice ID, booking ID, etc.
  expires_at   timestamptz,                     -- when this credit batch expires (for FIFO expiration)
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credits_ledger_user_id_idx   ON public.credits_ledger(user_id);
CREATE INDEX IF NOT EXISTS credits_ledger_created_at_idx ON public.credits_ledger(user_id, created_at DESC);

-- View: current balance per user (sum of all non-expired deltas)
CREATE OR REPLACE VIEW public.credit_balance AS
  SELECT
    user_id,
    COALESCE(SUM(delta), 0) AS balance
  FROM public.credits_ledger
  WHERE expires_at IS NULL OR expires_at > now()
  GROUP BY user_id;

-- ---------------------------------------------------------------------------
-- 6. Bookings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,   -- NULL for guest bookings
  customer_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  start_time     timestamptz NOT NULL,
  end_time       timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'requested'
                   CHECK (status IN (
                     'requested','confirmed','canceled',
                     'pending_payment','no_show'
                   )),
  notes          text,
  credits_burned numeric(8,2),
  -- Guest booking fields (populated when user_id is NULL)
  guest_name     text,
  guest_email    text,
  -- Square order reference for guest payment confirmation
  square_order_id text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_time_order CHECK (end_time > start_time)
);

-- Prevent overlapping confirmed/requested bookings (exclusion constraint requires btree_gist)
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_no_overlap_excl'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_no_overlap_excl
      EXCLUDE USING GIST (
        tstzrange(start_time, end_time, '[)') WITH &&
      )
      WHERE (status IN ('confirmed', 'requested', 'pending_payment'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS bookings_user_id_idx    ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS bookings_start_time_idx ON public.bookings(start_time);
CREATE INDEX IF NOT EXISTS bookings_status_idx     ON public.bookings(status);

-- ---------------------------------------------------------------------------
-- 7. Booking holds (overnight equipment holds)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.booking_holds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  hold_start  timestamptz NOT NULL,
  hold_end    timestamptz NOT NULL,
  hold_type   text NOT NULL DEFAULT 'overnight',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hold_time_order CHECK (hold_end > hold_start)
);

-- Holds also block time — prevent overlapping holds
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'booking_holds_no_overlap_excl'
  ) THEN
    ALTER TABLE public.booking_holds
      ADD CONSTRAINT booking_holds_no_overlap_excl
      EXCLUDE USING GIST (
        tstzrange(hold_start, hold_end, '[)') WITH &&
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS booking_holds_booking_id_idx  ON public.booking_holds(booking_id);
CREATE INDEX IF NOT EXISTS booking_holds_hold_start_idx  ON public.booking_holds(hold_start);

-- ---------------------------------------------------------------------------
-- 8. Atomic booking + credit burn RPC
--    Called from server/api/bookings/create.post.ts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_confirmed_booking_with_burn(
  p_user_id       uuid,
  p_customer_id   uuid,
  p_start_time    timestamptz,
  p_end_time      timestamptz,
  p_notes         text,
  p_request_hold  boolean,
  p_credits_needed numeric
)
RETURNS TABLE (
  booking_id     uuid,
  hold_id        uuid,
  credits_burned numeric,
  new_balance    numeric
)
LANGUAGE plpgsql
SECURITY DEFINER  -- runs as owner, bypasses RLS for atomicity
AS $$
DECLARE
  v_booking_id  uuid;
  v_hold_id     uuid;
  v_balance     numeric;
  v_burned      numeric;
  v_hold_start  timestamptz;
  v_hold_end    timestamptz;
BEGIN
  -- 1. Check credit balance (with row-level lock to prevent races)
  SELECT COALESCE(SUM(delta), 0)
    INTO v_balance
    FROM public.credits_ledger
    WHERE user_id = p_user_id
      AND (expires_at IS NULL OR expires_at > now())
    FOR UPDATE;  -- advisory lock on ledger rows for this user

  IF v_balance < p_credits_needed THEN
    RAISE EXCEPTION 'Insufficient credits: have %, need %', v_balance, p_credits_needed;
  END IF;

  -- 2. Insert booking (overlap is caught by the GIST exclusion index)
  INSERT INTO public.bookings (
    user_id, customer_id, start_time, end_time,
    status, notes, credits_burned
  )
  VALUES (
    p_user_id, p_customer_id, p_start_time, p_end_time,
    'confirmed', p_notes, p_credits_needed
  )
  RETURNING id INTO v_booking_id;

  -- 3. Burn credits (negative delta)
  v_burned := CEIL(p_credits_needed * 100) / 100;  -- round up to 2dp

  INSERT INTO public.credits_ledger (user_id, delta, reason, external_ref)
  VALUES (p_user_id, -v_burned, 'booking_burn', v_booking_id::text);

  -- 4. Optional overnight hold (hold_end = next day 10am LA time)
  IF p_request_hold THEN
    v_hold_start := p_end_time;
    v_hold_end   := (p_end_time AT TIME ZONE 'America/Los_Angeles')::date
                    + INTERVAL '1 day'
                    + INTERVAL '10 hours';
    v_hold_end   := v_hold_end AT TIME ZONE 'America/Los_Angeles';

    INSERT INTO public.booking_holds (booking_id, hold_start, hold_end)
    VALUES (v_booking_id, v_hold_start, v_hold_end)
    RETURNING id INTO v_hold_id;
  END IF;

  -- 5. Return result
  SELECT COALESCE(SUM(delta), 0)
    INTO v_balance
    FROM public.credits_ledger
    WHERE user_id = p_user_id
      AND (expires_at IS NULL OR expires_at > now());

  RETURN QUERY SELECT v_booking_id, v_hold_id, v_burned, v_balance;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Seed: membership tiers
-- ---------------------------------------------------------------------------

INSERT INTO public.membership_tiers
  (id, display_name, description, booking_window_days, peak_multiplier, max_bank, max_slots, holds_included, active, visible, sort_order)
VALUES
  ('creator',     'Creator',   'For hobbyists and new photographers. Great for practice sessions.',         30,  2.00, 25, 10, 0, true, true, 1),
  ('pro',         'Pro',       'For active working photographers and freelancers.',                         60,  1.50, 50,  5, 1, true, true, 2),
  ('studio_plus', 'Studio+',   'For commercial users, agencies, and high-volume bookings.',                90,  1.25, 80,  3, 1, true, true, 3)
ON CONFLICT (id) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  description         = EXCLUDED.description,
  booking_window_days = EXCLUDED.booking_window_days,
  peak_multiplier     = EXCLUDED.peak_multiplier,
  max_bank            = EXCLUDED.max_bank,
  max_slots           = EXCLUDED.max_slots,
  holds_included      = EXCLUDED.holds_included,
  sort_order          = EXCLUDED.sort_order,
  updated_at          = now();

-- ---------------------------------------------------------------------------
-- 10. Seed: plan variations (prices without Square IDs for now)
--     Update provider_plan_variation_id after creating plans in Square dashboard.
-- ---------------------------------------------------------------------------

INSERT INTO public.membership_plan_variations
  (tier_id, cadence, provider, credits_per_month, price_cents, currency, discount_label, sort_order)
VALUES
  -- Creator
  ('creator', 'monthly',   'square', 10, 35000, 'USD', NULL,       1),
  ('creator', 'quarterly', 'square', 12, 31500, 'USD', 'Save 10%', 2),
  ('creator', 'annual',    'square', 14, 29750, 'USD', 'Save 15%', 3),
  -- Pro
  ('pro', 'monthly',   'square', 25, 65000, 'USD', NULL,       1),
  ('pro', 'quarterly', 'square', 27, 58500, 'USD', 'Save 10%', 2),
  ('pro', 'annual',    'square', 30, 55250, 'USD', 'Save 15%', 3),
  -- Studio+
  ('studio_plus', 'monthly',   'square', 40, 95000, 'USD', NULL,       1),
  ('studio_plus', 'quarterly', 'square', 45, 85500, 'USD', 'Save 10%', 2),
  ('studio_plus', 'annual',    'square', 50, 80750, 'USD', 'Save 15%', 3)
ON CONFLICT (tier_id, cadence, provider) DO UPDATE SET
  credits_per_month = EXCLUDED.credits_per_month,
  price_cents       = EXCLUDED.price_cents,
  discount_label    = EXCLUDED.discount_label,
  sort_order        = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- 11. Seed: system_config defaults
-- ---------------------------------------------------------------------------

-- system_config.value is jsonb — insert numeric values without quotes
DO $$
BEGIN
  IF to_regclass('public.system_config') IS NOT NULL THEN
    INSERT INTO public.system_config (key, value) VALUES
      ('guest_booking_rate_per_credit_cents', '3500'::jsonb),
      ('guest_peak_multiplier',               '2.0'::jsonb),
      ('guest_booking_window_days',           '7'::jsonb),
      ('credit_expiry_days',                  '90'::jsonb),
      ('credit_rollover_max_multiplier',      '2.0'::jsonb)
    ON CONFLICT (key) DO NOTHING;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 12. Updated_at auto-maintenance triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$ BEGIN
  CREATE TRIGGER trg_memberships_updated_at
    BEFORE UPDATE ON public.memberships
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_membership_tiers_updated_at
    BEFORE UPDATE ON public.membership_tiers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
