CREATE TABLE IF NOT EXISTS public.analytics_ad_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  platform text NOT NULL CHECK (lower(platform) IN ('google', 'meta')),
  campaign text NOT NULL,
  spend numeric(12, 2) NOT NULL DEFAULT 0 CHECK (spend >= 0),
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  impressions integer NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  conversions numeric(12, 2) NOT NULL DEFAULT 0 CHECK (conversions >= 0),
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, platform, campaign, source)
);

CREATE INDEX IF NOT EXISTS analytics_ad_daily_date_idx
  ON public.analytics_ad_daily (date DESC);

CREATE INDEX IF NOT EXISTS analytics_ad_daily_platform_date_idx
  ON public.analytics_ad_daily (platform, date DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_analytics_ad_daily_updated_at'
  ) THEN
    CREATE TRIGGER trg_analytics_ad_daily_updated_at
      BEFORE UPDATE ON public.analytics_ad_daily
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.analytics_ad_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_ad_daily_staff_select" ON public.analytics_ad_daily;
CREATE POLICY "analytics_ad_daily_staff_select"
  ON public.analytics_ad_daily
  FOR SELECT
  TO public
  USING (public.is_dashboard_staff());

DROP POLICY IF EXISTS "analytics_ad_daily_staff_insert" ON public.analytics_ad_daily;
CREATE POLICY "analytics_ad_daily_staff_insert"
  ON public.analytics_ad_daily
  FOR INSERT
  TO public
  WITH CHECK (public.is_dashboard_staff());

DROP POLICY IF EXISTS "analytics_ad_daily_staff_update" ON public.analytics_ad_daily;
CREATE POLICY "analytics_ad_daily_staff_update"
  ON public.analytics_ad_daily
  FOR UPDATE
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

DROP POLICY IF EXISTS "analytics_ad_daily_staff_delete" ON public.analytics_ad_daily;
CREATE POLICY "analytics_ad_daily_staff_delete"
  ON public.analytics_ad_daily
  FOR DELETE
  TO public
  USING (public.is_dashboard_staff());
