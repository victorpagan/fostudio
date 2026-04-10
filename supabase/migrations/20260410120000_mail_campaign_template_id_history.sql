-- Track per-campaign SendGrid template-id changes as an auditable history.

CREATE TABLE IF NOT EXISTS public.mail_campaign_template_id_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.mail_campaigns(id) ON DELETE CASCADE,
  template_id text NOT NULL CHECK (length(btrim(template_id)) > 0),
  saved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_campaign_template_id_history_campaign_saved_at
  ON public.mail_campaign_template_id_history (campaign_id, saved_at DESC);

ALTER TABLE public.mail_campaign_template_id_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mail_campaign_template_id_history_staff_all" ON public.mail_campaign_template_id_history;
CREATE POLICY "mail_campaign_template_id_history_staff_all"
  ON public.mail_campaign_template_id_history
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

-- Backfill one history row per campaign with existing non-empty template ids.
INSERT INTO public.mail_campaign_template_id_history (
  campaign_id,
  template_id,
  saved_by,
  saved_at
)
SELECT
  campaign.id,
  btrim(campaign.sendgrid_template_id),
  campaign.created_by,
  COALESCE(campaign.updated_at, campaign.created_at, now())
FROM public.mail_campaigns AS campaign
WHERE length(btrim(COALESCE(campaign.sendgrid_template_id, ''))) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.mail_campaign_template_id_history AS history
    WHERE history.campaign_id = campaign.id
  );
