-- =============================================================================
-- FO Studio — Expand bookings.status check constraint
-- The original constraint only had: requested, confirmed, canceled, completed, declined
-- We need: pending_payment (for guest pay-before-confirm flow) and no_show
-- =============================================================================

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check CHECK (
    status = ANY (ARRAY[
      'requested'::text,
      'confirmed'::text,
      'canceled'::text,
      'completed'::text,
      'declined'::text,
      'pending_payment'::text,
      'no_show'::text
    ])
  );
