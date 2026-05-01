-- =============================================================================
-- Authenticated guest booking + standby booking policy
-- =============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS booking_rate_kind text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS rate_policy_snapshot jsonb;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_booking_rate_kind_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_rate_kind_check
  CHECK (booking_rate_kind IN ('standard', 'standby'));

CREATE INDEX IF NOT EXISTS bookings_pending_payment_expires_idx
  ON public.bookings(status, payment_expires_at)
  WHERE status = 'pending_payment';

CREATE INDEX IF NOT EXISTS bookings_rate_kind_start_idx
  ON public.bookings(booking_rate_kind, start_time DESC);

INSERT INTO public.system_config (key, value)
VALUES
  ('guest_peak_multiplier', '2.5'::jsonb),
  ('guest_booking_window_days', '20'::jsonb),
  ('guest_booking_start_hour', '11'::jsonb),
  ('guest_booking_end_hour', '19'::jsonb),
  ('guest_min_booking_hours', '2'::jsonb),
  ('guest_booking_increment_minutes', '60'::jsonb),
  ('guest_credit_expiry_days', '30'::jsonb),
  ('guest_pending_payment_hold_minutes', '15'::jsonb),
  ('standby_enabled', 'true'::jsonb),
  ('standby_min_open_slot_hours', '4'::jsonb),
  ('standby_discount_multiplier', '0.5'::jsonb),
  ('member_standby_start_hour', '8'::jsonb),
  ('member_standby_window_hours', '10'::jsonb),
  ('guest_standby_window_hours', '6'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value
WHERE public.system_config.key IN (
  'guest_peak_multiplier',
  'guest_booking_window_days'
);

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
     AND payment_expires_at IS NOT NULL
     AND payment_expires_at <= p_now;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_paid_guest_booking_with_burn(
  p_user_id uuid,
  p_booking_id uuid,
  p_topup_session_id uuid,
  p_credits_purchased numeric,
  p_amount_cents integer,
  p_payment_ref text,
  p_topup_expires_at timestamptz
)
RETURNS TABLE (
  booking_id uuid,
  credits_added numeric,
  credits_burned numeric,
  new_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_needed numeric := 0;
  v_balance numeric := 0;
  v_topoff_ref text := p_topup_session_id::text || ':guest_booking_topoff';
  v_burn_ref text := p_booking_id::text || ':guest_booking';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT *
    INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id
     AND user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest booking not found';
  END IF;

  IF v_booking.status = 'confirmed' THEN
    SELECT COALESCE(SUM(delta), 0)
      INTO v_balance
      FROM public.credits_ledger
     WHERE user_id = p_user_id
       AND (expires_at IS NULL OR expires_at > now());

    RETURN QUERY SELECT v_booking.id, 0::numeric, COALESCE(v_booking.credits_burned, 0), v_balance;
    RETURN;
  END IF;

  IF v_booking.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Guest booking cannot be confirmed from status %', v_booking.status;
  END IF;

  IF v_booking.payment_expires_at IS NOT NULL AND v_booking.payment_expires_at <= now() THEN
    RAISE EXCEPTION 'Guest booking payment reservation expired';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.credits_ledger
     WHERE user_id = p_user_id
       AND reason = 'topoff'
       AND external_ref = v_topoff_ref
  ) THEN
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
      NULL,
      GREATEST(COALESCE(p_credits_purchased, 0), 0),
      'topoff',
      v_topoff_ref,
      p_topup_expires_at,
      jsonb_build_object(
        'source', 'guest_booking_shortfall',
        'booking_id', p_booking_id,
        'topup_session_id', p_topup_session_id,
        'amount_cents', p_amount_cents,
        'payment_ref', p_payment_ref
      )
    );
  END IF;

  v_needed := GREATEST(COALESCE(v_booking.credits_burned, v_booking.credits_estimated, 0), 0);

  SELECT COALESCE(SUM(delta), 0)
    INTO v_balance
    FROM public.credits_ledger
   WHERE user_id = p_user_id
     AND (expires_at IS NULL OR expires_at > now());

  IF v_balance < v_needed THEN
    RAISE EXCEPTION 'Insufficient credits after payment: have %, need %', v_balance, v_needed;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.credits_ledger
     WHERE user_id = p_user_id
       AND reason = 'booking_burn'
       AND external_ref = v_burn_ref
  ) THEN
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
      v_burn_ref,
      jsonb_build_object(
        'source', 'guest_booking_payment',
        'booking_id', p_booking_id,
        'topup_session_id', p_topup_session_id,
        'booking_rate_kind', v_booking.booking_rate_kind
      )
    );
  END IF;

  UPDATE public.bookings
     SET status = 'confirmed',
         updated_at = now(),
         rate_policy_snapshot = COALESCE(rate_policy_snapshot, '{}'::jsonb)
           || jsonb_build_object('confirmed_from_guest_payment_at', now(), 'payment_ref', p_payment_ref)
   WHERE id = p_booking_id;

  SELECT COALESCE(SUM(delta), 0)
    INTO v_balance
    FROM public.credits_ledger
   WHERE user_id = p_user_id
     AND (expires_at IS NULL OR expires_at > now());

  RETURN QUERY SELECT p_booking_id, GREATEST(COALESCE(p_credits_purchased, 0), 0), v_needed, v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_pending_guest_bookings(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_paid_guest_booking_with_burn(uuid, uuid, uuid, numeric, integer, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_guest_bookings(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_paid_guest_booking_with_burn(uuid, uuid, uuid, numeric, integer, text, timestamptz) TO service_role;
