-- =============================================================================
-- FO Studio — Add guest booking columns to bookings table
-- The bookings table already exists but is missing fields needed for the
-- guest (pay-as-you-go) booking flow. This migration adds them idempotently.
-- =============================================================================

-- Add guest-specific columns
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_name    text,
  ADD COLUMN IF NOT EXISTS guest_email   text,
  ADD COLUMN IF NOT EXISTS square_order_id text,
  -- credits_burned is an alias concept; actual columns are credits_estimated/credits_final
  -- We add credits_burned as a generated/alias column for backward compat with our code
  ADD COLUMN IF NOT EXISTS credits_burned numeric(8,2);

-- Make user_id nullable so guest bookings (no auth user) can be inserted
ALTER TABLE public.bookings
  ALTER COLUMN user_id DROP NOT NULL;
