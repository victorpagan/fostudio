-- =============================================================================
-- Membership cadence expansion: add daily and weekly support.
-- =============================================================================

DO $$
DECLARE
  row record;
BEGIN
  IF to_regclass('public.membership_plan_variations') IS NOT NULL THEN
    FOR row IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      WHERE n.nspname = 'public'
        AND t.relname = 'membership_plan_variations'
        AND c.contype = 'c'
        AND a.attname = 'cadence'
    LOOP
      EXECUTE format('ALTER TABLE public.membership_plan_variations DROP CONSTRAINT %I', row.conname);
    END LOOP;

    ALTER TABLE public.membership_plan_variations
      ADD CONSTRAINT membership_plan_variations_cadence_check
      CHECK (cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual'));
  END IF;
END $$;

DO $$
DECLARE
  row record;
BEGIN
  IF to_regclass('public.memberships') IS NOT NULL THEN
    FOR row IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      WHERE n.nspname = 'public'
        AND t.relname = 'memberships'
        AND c.contype = 'c'
        AND a.attname = 'cadence'
    LOOP
      EXECUTE format('ALTER TABLE public.memberships DROP CONSTRAINT %I', row.conname);
    END LOOP;

    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_cadence_check
      CHECK (cadence IS NULL OR cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual'));
  END IF;
END $$;

DO $$
DECLARE
  row record;
BEGIN
  IF to_regclass('public.membership_checkout_sessions') IS NOT NULL THEN
    FOR row IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
      WHERE n.nspname = 'public'
        AND t.relname = 'membership_checkout_sessions'
        AND c.contype = 'c'
        AND a.attname = 'cadence'
    LOOP
      EXECUTE format('ALTER TABLE public.membership_checkout_sessions DROP CONSTRAINT %I', row.conname);
    END LOOP;

    ALTER TABLE public.membership_checkout_sessions
      ADD CONSTRAINT membership_checkout_sessions_cadence_check
      CHECK (cadence IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual'));
  END IF;
END $$;
