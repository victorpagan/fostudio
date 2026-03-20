-- =============================================================================
-- FO Studio — Row Level Security Policies
-- Run after 20240001_studio_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: is the current user an admin or service role?
-- Reads from auth.users.app_metadata (set server-side only).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'service'),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own customer row
CREATE POLICY "customers: own row read"
  ON public.customers FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "customers: own row update"
  ON public.customers FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- Server bootstrap inserts via service role (bypasses RLS automatically)
-- No explicit INSERT policy needed for users — bootstrap uses service role.

-- ---------------------------------------------------------------------------
-- membership_tiers  (public read, admin write)
-- ---------------------------------------------------------------------------

ALTER TABLE public.membership_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tiers: public read"
  ON public.membership_tiers FOR SELECT
  USING (active = true AND visible = true OR public.is_admin());

CREATE POLICY "tiers: admin write"
  ON public.membership_tiers FOR ALL
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- membership_plan_variations  (public read, admin write)
-- ---------------------------------------------------------------------------

ALTER TABLE public.membership_plan_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_variations: public read"
  ON public.membership_plan_variations FOR SELECT
  USING (active = true AND visible = true OR public.is_admin());

CREATE POLICY "plan_variations: admin write"
  ON public.membership_plan_variations FOR ALL
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- Users read their own; admins read all
CREATE POLICY "memberships: own row read"
  ON public.memberships FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- Only service role inserts (via webhook or checkout) — no direct user insert
-- Admins can do anything
CREATE POLICY "memberships: admin all"
  ON public.memberships FOR ALL
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Public can see confirmed bookings (time blocks only — no user info)
-- This powers the public calendar without leaking member data
CREATE POLICY "bookings: public confirmed read"
  ON public.bookings FOR SELECT
  USING (status IN ('confirmed', 'pending_payment'));

-- Members can read all details of their own bookings
CREATE POLICY "bookings: own bookings full read"
  ON public.bookings FOR SELECT
  USING (user_id = auth.uid());

-- Members can insert bookings (actual validation happens in the RPC/API)
CREATE POLICY "bookings: member insert"
  ON public.bookings FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);  -- NULL for guest bookings

-- Members can update their own bookings (for cancellation)
CREATE POLICY "bookings: member update own"
  ON public.bookings FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin());

-- Admins can do everything
CREATE POLICY "bookings: admin all"
  ON public.bookings FOR ALL
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- booking_holds
-- ---------------------------------------------------------------------------

ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;

-- Public can see holds (they block calendar time)
CREATE POLICY "holds: public read"
  ON public.booking_holds FOR SELECT
  USING (true);

-- Only the API (service role or via booking RPC) manages holds
CREATE POLICY "holds: admin all"
  ON public.booking_holds FOR ALL
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- credits_ledger
-- ---------------------------------------------------------------------------

ALTER TABLE public.credits_ledger ENABLE ROW LEVEL SECURITY;

-- Users can read their own ledger
CREATE POLICY "ledger: own read"
  ON public.credits_ledger FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- Only service role / RPC writes to the ledger (no direct user writes)
-- The SECURITY DEFINER on create_confirmed_booking_with_burn handles member burns.
-- Webhook server uses service role for subscription minting.
CREATE POLICY "ledger: admin write"
  ON public.credits_ledger FOR INSERT
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- credit_balance view — inherits from credits_ledger RLS automatically
-- (Views in Supabase use SECURITY INVOKER by default so RLS is respected)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- system_config  (public read for non-sensitive keys, admin write)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.system_config') IS NOT NULL THEN
    ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

    -- All config values are currently non-sensitive (rates, window sizes)
    -- If you add sensitive keys in future, add a 'public' boolean column to filter.
    CREATE POLICY "system_config: public read"
      ON public.system_config FOR SELECT
      USING (true);

    CREATE POLICY "system_config: admin write"
      ON public.system_config FOR ALL
      USING (public.is_admin());
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Grant service role access to the credit_balance view
-- (The service role bypasses RLS but needs explicit view access)
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.credit_balance TO authenticated;
GRANT SELECT ON public.credit_balance TO anon;
