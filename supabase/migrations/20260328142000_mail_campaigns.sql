-- Dedicated campaign templates + campaign drafts/sends
-- This is separate from mail_template_registry and powers admin broadcast workflows.

CREATE TABLE IF NOT EXISTS public.mail_campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'mailing.memberBroadcast',
  sendgrid_template_id text NOT NULL DEFAULT '',
  subject_template text NOT NULL DEFAULT '',
  preheader_template text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mail_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'archived')),
  template_id uuid REFERENCES public.mail_campaign_templates(id) ON DELETE SET NULL,
  event_type text NOT NULL DEFAULT 'mailing.memberBroadcast',
  sendgrid_template_id text NOT NULL DEFAULT '',
  subject_template text NOT NULL DEFAULT '',
  preheader_template text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  include_membership_recipients boolean NOT NULL DEFAULT true,
  additional_recipients text[] NOT NULL DEFAULT '{}'::text[],
  last_send_summary jsonb,
  last_sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_mail_campaign_templates_updated_at'
  ) THEN
    CREATE TRIGGER trg_mail_campaign_templates_updated_at
      BEFORE UPDATE ON public.mail_campaign_templates
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_mail_campaigns_updated_at'
  ) THEN
    CREATE TRIGGER trg_mail_campaigns_updated_at
      BEFORE UPDATE ON public.mail_campaigns
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.mail_campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_campaign_templates_staff_all" ON public.mail_campaign_templates;
CREATE POLICY "mail_campaign_templates_staff_all"
  ON public.mail_campaign_templates
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

DROP POLICY IF EXISTS "mail_campaigns_staff_all" ON public.mail_campaigns;
CREATE POLICY "mail_campaigns_staff_all"
  ON public.mail_campaigns
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

INSERT INTO public.mail_campaign_templates (
  slug,
  name,
  description,
  event_type,
  sendgrid_template_id,
  subject_template,
  preheader_template,
  body_template,
  active
)
VALUES
  (
    'member-broadcast',
    'Member Broadcast',
    'General member updates and announcements.',
    'mailing.memberBroadcast',
    '',
    'Studio update for {{ customerName }}',
    'Important FO Studio updates and next steps.',
    '<p>Hello {{ customerName }},</p><p>We have an update from FO Studio.</p><p>Thanks,<br>FO Studio Team</p>',
    true
  ),
  (
    'admin-reminder',
    'Admin Reminder',
    'Operational reminder template for studio members.',
    'mailing.memberBroadcast',
    '',
    'Reminder: studio operations update',
    'Heads up from FO Studio operations.',
    '<p>Hello {{ customerName }},</p><p>This is a quick operations reminder from FO Studio.</p><p>Need help? <a href="mailto:hello@lafilmlab.com">hello@lafilmlab.com</a></p>',
    true
  ),
  (
    'event-announcement',
    'Event Announcement',
    'Launches, events, and campaign-style announcements.',
    'mailing.memberBroadcast',
    '',
    'New at FO Studio',
    'Upcoming event and booking details.',
    '<p>Hello {{ customerName }},</p><p>We are announcing something new at FO Studio.</p><p>Check details in your dashboard.</p>',
    true
  )
ON CONFLICT (slug) DO NOTHING;
