DO $$
BEGIN
  IF to_regclass('public.settings') IS NOT NULL THEN
    ALTER TABLE public.settings
      ADD COLUMN IF NOT EXISTS "membershipCheckoutActivation" text;
  END IF;
END
$$;
