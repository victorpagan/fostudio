-- Automated email reminders + reminder audit trail.
-- Reminders are mostly non-critical and are sent by an app endpoint invoked
-- hourly by Supabase pg_cron through pg_net.

ALTER TABLE public.mail_user_preferences
  ALTER COLUMN non_critical_enabled SET DEFAULT true;

UPDATE public.mail_user_preferences
   SET non_critical_enabled = true,
       updated_at = now()
 WHERE non_critical_enabled = false;

CREATE TABLE IF NOT EXISTS public.mail_reminder_rules (
  event_type text PRIMARY KEY,
  category text NOT NULL DEFAULT 'non_critical' CHECK (category IN ('critical', 'non_critical')),
  enabled boolean NOT NULL DEFAULT true,
  offsets_minutes integer[] NOT NULL DEFAULT '{}'::integer[],
  cooldown_hours integer NOT NULL DEFAULT 24 CHECK (cooldown_hours >= 0),
  description text,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mail_reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  reminder_key text NOT NULL,
  category text NOT NULL DEFAULT 'non_critical' CHECK (category IN ('critical', 'non_critical')),
  status text NOT NULL CHECK (status IN ('sent', 'skipped', 'error')),
  to_email text,
  template_id text,
  skip_reason text,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  fomailer_response jsonb,
  sent_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_reminder_deliveries_unique_key
    UNIQUE (event_type, user_id, entity_type, entity_id, reminder_key)
);

CREATE INDEX IF NOT EXISTS mail_reminder_deliveries_user_created_idx
  ON public.mail_reminder_deliveries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mail_reminder_deliveries_event_created_idx
  ON public.mail_reminder_deliveries (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS mail_reminder_deliveries_status_created_idx
  ON public.mail_reminder_deliveries (status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mail_reminder_rules_updated_at'
  ) THEN
    CREATE TRIGGER trg_mail_reminder_rules_updated_at
      BEFORE UPDATE ON public.mail_reminder_rules
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mail_reminder_deliveries_updated_at'
  ) THEN
    CREATE TRIGGER trg_mail_reminder_deliveries_updated_at
      BEFORE UPDATE ON public.mail_reminder_deliveries
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.mail_reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_reminder_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_reminder_rules_staff_all" ON public.mail_reminder_rules;
CREATE POLICY "mail_reminder_rules_staff_all"
  ON public.mail_reminder_rules
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

DROP POLICY IF EXISTS "mail_reminder_deliveries_staff_all" ON public.mail_reminder_deliveries;
CREATE POLICY "mail_reminder_deliveries_staff_all"
  ON public.mail_reminder_deliveries
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

INSERT INTO public.mail_reminder_rules (
  event_type,
  category,
  enabled,
  offsets_minutes,
  cooldown_hours,
  description,
  admin_notes
)
VALUES
  ('booking.upcomingReminder', 'non_critical', true, ARRAY[1440, 120], 12, 'Booking reminder before upcoming confirmed/requested bookings.', 'Sends 24h and 2h before booking start.'),
  ('credits.expiringReminder', 'non_critical', true, ARRAY[10080, 2880], 24, 'Reminder before remaining credits expire.', 'Sends 7d and 2d before the earliest active credit expiry.'),
  ('membership.cancellationEndingReminder', 'non_critical', true, ARRAY[20160, 4320], 24, 'Reminder before a scheduled cancellation reaches period end.', 'Targets active memberships with canceled_at and upcoming current_period_end.'),
  ('membership.pastDueReminder', 'non_critical', true, ARRAY[4320, 10080], 24, 'Reminder after a membership enters past_due.', 'Uses membership updated/period timestamps as the best available past-due anchor.'),
  ('account.guestOnboardingReminder', 'non_critical', true, ARRAY[1440, 10080], 24, 'New guest account onboarding reminder.', 'Targets accounts with no membership, booking, or top-up.'),
  ('account.inactiveReminder', 'non_critical', true, ARRAY[43200], 168, 'Inactive account reminder.', 'Targets accounts with no booking or membership activity after signup.'),
  ('booking.reactivationReminder', 'non_critical', true, ARRAY[64800], 168, 'Reactivation reminder after no recent bookings.', 'Targets users 45d after their last booking when no future booking exists.'),
  ('waiver.expiringReminder', 'non_critical', true, ARRAY[20160, 4320], 24, 'Waiver expiry reminder.', 'Sends 14d and 3d before the latest waiver signature expires.')
ON CONFLICT (event_type) DO UPDATE
SET
  category = EXCLUDED.category,
  offsets_minutes = EXCLUDED.offsets_minutes,
  description = EXCLUDED.description,
  admin_notes = EXCLUDED.admin_notes,
  updated_at = now();

INSERT INTO public.system_config (key, value)
VALUES
  ('MAIL_REMINDER_PROCESSOR_URL', '"https://fo.studio/api/internal/mail/reminders/process"'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.invoke_mail_reminder_processor()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_shared_key text;
  v_request_id bigint;
BEGIN
  SELECT value #>> '{}'
    INTO v_url
    FROM public.system_config
   WHERE key = 'MAIL_REMINDER_PROCESSOR_URL'
   LIMIT 1;

  IF v_url IS NULL OR btrim(v_url) = '' THEN
    RAISE NOTICE 'MAIL_REMINDER_PROCESSOR_URL is not configured';
    RETURN NULL;
  END IF;

  SELECT decrypted_secret
    INTO v_shared_key
    FROM vault.decrypted_secrets
   WHERE name = 'MAIL_REMINDER_SHARED_KEY'
   LIMIT 1;

  IF v_shared_key IS NULL OR btrim(v_shared_key) = '' THEN
    RAISE NOTICE 'MAIL_REMINDER_SHARED_KEY is not configured in vault';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-reminder-key', v_shared_key
    ),
    body := jsonb_build_object('limit', 200)
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_mail_reminder_processor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_mail_reminder_processor() TO service_role;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RETURN;
  END IF;

  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'process-mail-reminders'
   LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'process-mail-reminders',
    '23 * * * *',
    $cron$SELECT public.invoke_mail_reminder_processor();$cron$
  );
END $$;
