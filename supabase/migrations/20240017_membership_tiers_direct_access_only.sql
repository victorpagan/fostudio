-- =============================================================================
-- Membership tier direct-access flag
-- - direct_access_only tiers are hidden from catalog listings
-- - intended for private/admin-only checkout links
-- =============================================================================

ALTER TABLE public.membership_tiers
  ADD COLUMN IF NOT EXISTS direct_access_only boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS membership_tiers_direct_access_only_idx
  ON public.membership_tiers(direct_access_only);

