-- Membership caps + waitlist support
-- - Enforce default caps for new tiers
-- - Seed cap values for core tiers
-- - Add waitlist table for capped memberships
-- - Add fomailer template key for waitlist invites (per location)

ALTER TABLE public.membership_tiers
  ALTER COLUMN max_slots SET DEFAULT 10;

UPDATE public.membership_tiers
SET max_slots = 10
WHERE id = 'creator';

UPDATE public.membership_tiers
SET max_slots = 5
WHERE id = 'pro';

UPDATE public.membership_tiers
SET max_slots = 3
WHERE id = 'studio_plus';

CREATE TABLE IF NOT EXISTS public.membership_waitlist (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id            text NOT NULL REFERENCES public.membership_tiers(id) ON DELETE CASCADE,
  cadence            text CHECK (cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
  user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email              text NOT NULL,
  phone              text,
  is_priority_member boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'invited', 'claimed', 'removed')),
  invited_at         timestamptz,
  claimed_at         timestamptz,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS membership_waitlist_tier_status_idx
  ON public.membership_waitlist(tier_id, status, created_at);

CREATE INDEX IF NOT EXISTS membership_waitlist_user_idx
  ON public.membership_waitlist(user_id, tier_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS membership_waitlist_pending_user_unique_idx
  ON public.membership_waitlist(tier_id, user_id)
  WHERE user_id IS NOT NULL AND status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS membership_waitlist_pending_email_unique_idx
  ON public.membership_waitlist(tier_id, lower(email))
  WHERE user_id IS NULL AND status = 'pending';

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS "membershipWaitlistInvite" text;
