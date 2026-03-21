DO $$
BEGIN
  IF to_regclass('public.settings') IS NOT NULL THEN
    ALTER TABLE public.settings
      ADD COLUMN IF NOT EXISTS "orderRefund" text,
      ADD COLUMN IF NOT EXISTS "membershipWaitlistInvite" text,
      ADD COLUMN IF NOT EXISTS "membershipCheckoutActivation" text,
      ADD COLUMN IF NOT EXISTS "backendError" text;
  END IF;
END
$$;
