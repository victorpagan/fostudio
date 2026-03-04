-- =============================================================================
-- Allow the admin-only test tier on legacy membership_tier enum schemas
-- - Some live environments still use the legacy public.membership_tier enum for
--   memberships.tier, even though newer migrations model memberships.tier as
--   a text foreign key. Add the 'test' label when that enum exists.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'membership_tier'
  ) THEN
    ALTER TYPE public.membership_tier ADD VALUE IF NOT EXISTS 'test';
  END IF;
END $$;
