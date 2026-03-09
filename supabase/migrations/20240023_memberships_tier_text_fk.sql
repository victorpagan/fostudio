-- Convert legacy memberships.tier enum to text + FK so admin-created tiers
-- (e.g. "nano") can be used in checkout/swap flows.
DO $$
DECLARE
  tier_udt_name text;
BEGIN
  SELECT c.udt_name
    INTO tier_udt_name
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'memberships'
    AND c.column_name = 'tier';

  -- Newer schemas already use text; only convert legacy enum schemas.
  IF tier_udt_name = 'membership_tier' THEN
    ALTER TABLE public.memberships
      ALTER COLUMN tier TYPE text USING tier::text;
  END IF;

  -- Enforce tier integrity through the canonical tiers table.
  ALTER TABLE public.memberships
    DROP CONSTRAINT IF EXISTS memberships_tier_fkey;

  ALTER TABLE public.memberships
    ADD CONSTRAINT memberships_tier_fkey
    FOREIGN KEY (tier) REFERENCES public.membership_tiers(id);
END
$$;

