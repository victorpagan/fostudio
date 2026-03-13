-- =============================================================================
-- Per-tier active hold cap (concurrent outstanding holds)
-- - Limits how many hold windows a member can have at once
-- - Default 0 for new tiers
-- =============================================================================

ALTER TABLE public.membership_tiers
  ADD COLUMN IF NOT EXISTS active_hold_cap integer;

UPDATE public.membership_tiers
   SET active_hold_cap = 0
 WHERE active_hold_cap IS NULL;

ALTER TABLE public.membership_tiers
  ALTER COLUMN active_hold_cap SET DEFAULT 0,
  ALTER COLUMN active_hold_cap SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'membership_tiers_active_hold_cap_check'
      AND conrelid = 'public.membership_tiers'::regclass
  ) THEN
    ALTER TABLE public.membership_tiers
      ADD CONSTRAINT membership_tiers_active_hold_cap_check
      CHECK (active_hold_cap >= 0 AND active_hold_cap <= 50);
  END IF;
END $$;

UPDATE public.membership_tiers
   SET active_hold_cap = CASE id
     WHEN 'creator' THEN 1
     WHEN 'pro' THEN 2
     WHEN 'studio_plus' THEN 3
     ELSE active_hold_cap
   END
 WHERE id IN ('creator', 'pro', 'studio_plus');
