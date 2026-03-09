ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS "membershipCheckoutActivation" text;

