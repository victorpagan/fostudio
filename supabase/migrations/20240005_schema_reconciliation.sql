-- =============================================================================
-- FO Studio — Schema reconciliation
-- Fixes to align code with actual remote DB column types:
--   - credits_ledger.delta: integer → numeric(10,2) for fractional credits
--   - membership_tiers: add max_slots (missing from original schema)
--   - Recreate credit_balance view after column type change
--   - Recreate create_confirmed_booking_with_burn with correct types
-- =============================================================================

-- 1. Drop view that depends on credits_ledger.delta
DROP VIEW IF EXISTS public.credit_balance;

-- 2. Upgrade delta to numeric for fractional credit support
ALTER TABLE public.credits_ledger
  ALTER COLUMN delta TYPE numeric(10,2) USING delta::numeric(10,2);

-- 3. Add max_slots to membership_tiers
ALTER TABLE public.membership_tiers
  ADD COLUMN IF NOT EXISTS max_slots integer;  -- NULL = unlimited

UPDATE public.membership_tiers SET max_slots = 10 WHERE id = 'creator';
UPDATE public.membership_tiers SET max_slots = 5  WHERE id = 'pro';
UPDATE public.membership_tiers SET max_slots = 3  WHERE id = 'studio_plus';

-- 4. Recreate credit_balance view
CREATE VIEW public.credit_balance AS
  SELECT
    user_id,
    COALESCE(SUM(delta), 0)::numeric(10,2) AS balance
  FROM public.credits_ledger
  GROUP BY user_id;

GRANT SELECT ON public.credit_balance TO authenticated, anon;

-- 5. Recreate atomic booking + credit burn RPC with correct types
--    Called by server/api/bookings/create.post.ts
--    SECURITY DEFINER so it bypasses RLS for atomicity.
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
AS $$
DECLARE
  v_booking_id  uuid;
  v_hold_id     uuid;
  v_balance     numeric;
  v_burned      numeric;
  v_hold_start  timestamptz;
  v_hold_end    timestamptz;
BEGIN
  -- Lock the user's ledger rows to prevent concurrent double-spend
  SELECT COALESCE(SUM(delta), 0)
    INTO v_balance
    FROM public.credits_ledger
    WHERE user_id = p_user_id
    FOR UPDATE;

  IF v_balance < p_credits_needed THEN
    RAISE EXCEPTION 'Insufficient credits: have %, need %', v_balance, p_credits_needed;
  END IF;

  -- Insert booking; time_range GIST index prevents slot overlaps
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

  -- Burn credits (fractional amounts supported)
  v_burned := p_credits_needed;
  INSERT INTO public.credits_ledger (user_id, delta, reason, external_ref)
  VALUES (p_user_id, -v_burned, 'booking_burn', v_booking_id::text);

  -- Optional overnight equipment hold (ends next day at 10am LA)
  IF p_request_hold THEN
    v_hold_start := p_end_time;
    v_hold_end   := ((p_end_time AT TIME ZONE 'America/Los_Angeles')::date
                      + INTERVAL '1 day'
                      + INTERVAL '10 hours')
                      AT TIME ZONE 'America/Los_Angeles';

    INSERT INTO public.booking_holds (booking_id, hold_start, hold_end, hold_type, hold_range)
    VALUES (v_booking_id, v_hold_start, v_hold_end, 'overnight',
            tstzrange(v_hold_start, v_hold_end, '[)'))
    RETURNING id INTO v_hold_id;
  END IF;

  -- Return final balance after burn
  SELECT COALESCE(SUM(delta), 0)
    INTO v_balance
    FROM public.credits_ledger
    WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_booking_id, v_hold_id, v_burned, v_balance;
END;
$$;
