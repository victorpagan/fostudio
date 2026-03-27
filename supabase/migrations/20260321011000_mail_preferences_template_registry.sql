-- Centralized mail preferences + template registry
-- - Adds template registry used by mail handlers
-- - Adds global admin-copy preferences
-- - Adds per-user mail preferences
-- - Backfills membership template IDs from settings
-- - Drops legacy membership template columns from settings

CREATE TABLE IF NOT EXISTS public.mail_template_registry (
  event_type text PRIMARY KEY,
  sendgrid_template_id text NOT NULL,
  category text NOT NULL CHECK (category IN ('critical', 'non_critical')),
  active boolean NOT NULL DEFAULT true,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mail_admin_copy_preferences (
  scope text PRIMARY KEY DEFAULT 'global',
  critical_enabled boolean NOT NULL DEFAULT true,
  non_critical_enabled boolean NOT NULL DEFAULT false,
  recipients text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_admin_copy_preferences_scope_check CHECK (scope = 'global')
);

CREATE TABLE IF NOT EXISTS public.mail_user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  critical_enabled boolean NOT NULL DEFAULT true,
  non_critical_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_mail_template_registry_updated_at'
  ) THEN
    CREATE TRIGGER trg_mail_template_registry_updated_at
      BEFORE UPDATE ON public.mail_template_registry
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_mail_admin_copy_preferences_updated_at'
  ) THEN
    CREATE TRIGGER trg_mail_admin_copy_preferences_updated_at
      BEFORE UPDATE ON public.mail_admin_copy_preferences
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_mail_user_preferences_updated_at'
  ) THEN
    CREATE TRIGGER trg_mail_user_preferences_updated_at
      BEFORE UPDATE ON public.mail_user_preferences
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.mail_template_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_admin_copy_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_template_registry_staff_all" ON public.mail_template_registry;
CREATE POLICY "mail_template_registry_staff_all"
  ON public.mail_template_registry
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

DROP POLICY IF EXISTS "mail_admin_copy_preferences_staff_all" ON public.mail_admin_copy_preferences;
CREATE POLICY "mail_admin_copy_preferences_staff_all"
  ON public.mail_admin_copy_preferences
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

DROP POLICY IF EXISTS "mail_user_preferences_select_own_or_staff" ON public.mail_user_preferences;
CREATE POLICY "mail_user_preferences_select_own_or_staff"
  ON public.mail_user_preferences
  FOR SELECT
  TO public
  USING ((auth.uid() = user_id) OR public.is_dashboard_staff());

DROP POLICY IF EXISTS "mail_user_preferences_insert_own_or_staff" ON public.mail_user_preferences;
CREATE POLICY "mail_user_preferences_insert_own_or_staff"
  ON public.mail_user_preferences
  FOR INSERT
  TO public
  WITH CHECK ((auth.uid() = user_id) OR public.is_dashboard_staff());

DROP POLICY IF EXISTS "mail_user_preferences_update_own_or_staff" ON public.mail_user_preferences;
CREATE POLICY "mail_user_preferences_update_own_or_staff"
  ON public.mail_user_preferences
  FOR UPDATE
  TO public
  USING ((auth.uid() = user_id) OR public.is_dashboard_staff())
  WITH CHECK ((auth.uid() = user_id) OR public.is_dashboard_staff());

DROP POLICY IF EXISTS "mail_user_preferences_delete_staff" ON public.mail_user_preferences;
CREATE POLICY "mail_user_preferences_delete_staff"
  ON public.mail_user_preferences
  FOR DELETE
  TO public
  USING (public.is_dashboard_staff());

INSERT INTO public.mail_admin_copy_preferences (scope)
VALUES ('global')
ON CONFLICT (scope) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.settings') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.mail_template_registry (event_type, sendgrid_template_id, category, active, description)
  SELECT
    'membership.waitlistInvite',
    src.template_id,
    'critical',
    true,
    'Membership waitlist invite'
  FROM (
    SELECT NULLIF(BTRIM("membershipWaitlistInvite"), '') AS template_id
    FROM public.settings
    WHERE NULLIF(BTRIM("membershipWaitlistInvite"), '') IS NOT NULL
    ORDER BY id DESC
    LIMIT 1
  ) AS src
  WHERE src.template_id IS NOT NULL
  ON CONFLICT (event_type) DO UPDATE
  SET
    sendgrid_template_id = EXCLUDED.sendgrid_template_id,
    category = EXCLUDED.category,
    active = EXCLUDED.active,
    description = EXCLUDED.description,
    updated_at = now();

  INSERT INTO public.mail_template_registry (event_type, sendgrid_template_id, category, active, description)
  SELECT
    'membership.checkoutActivationPending',
    src.template_id,
    'critical',
    true,
    'Membership checkout activation reminder'
  FROM (
    SELECT NULLIF(BTRIM("membershipCheckoutActivation"), '') AS template_id
    FROM public.settings
    WHERE NULLIF(BTRIM("membershipCheckoutActivation"), '') IS NOT NULL
    ORDER BY id DESC
    LIMIT 1
  ) AS src
  WHERE src.template_id IS NOT NULL
  ON CONFLICT (event_type) DO UPDATE
  SET
    sendgrid_template_id = EXCLUDED.sendgrid_template_id,
    category = EXCLUDED.category,
    active = EXCLUDED.active,
    description = EXCLUDED.description,
    updated_at = now();

  ALTER TABLE public.settings
    DROP COLUMN IF EXISTS "membershipWaitlistInvite",
    DROP COLUMN IF EXISTS "membershipCheckoutActivation";
END $$;
