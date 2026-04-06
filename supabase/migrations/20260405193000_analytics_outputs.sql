CREATE TABLE IF NOT EXISTS public.analytics_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamptz NOT NULL DEFAULT now(),
  week_of date,
  freshness text NOT NULL DEFAULT 'fresh' CHECK (freshness IN ('fresh', 'stale', 'missing')),
  metrics jsonb,
  trends jsonb,
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  weekly_report_md text,
  weekly_report_json jsonb,
  source text NOT NULL DEFAULT 'pipeline',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_outputs_generated_at_idx
  ON public.analytics_outputs (generated_at DESC);

CREATE INDEX IF NOT EXISTS analytics_outputs_week_of_idx
  ON public.analytics_outputs (week_of DESC);

ALTER TABLE public.analytics_outputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_outputs_staff_select" ON public.analytics_outputs;
CREATE POLICY "analytics_outputs_staff_select"
  ON public.analytics_outputs
  FOR SELECT
  TO public
  USING (public.is_dashboard_staff());

DROP POLICY IF EXISTS "analytics_outputs_staff_insert" ON public.analytics_outputs;
CREATE POLICY "analytics_outputs_staff_insert"
  ON public.analytics_outputs
  FOR INSERT
  TO public
  WITH CHECK (public.is_dashboard_staff());

DROP POLICY IF EXISTS "analytics_outputs_staff_update" ON public.analytics_outputs;
CREATE POLICY "analytics_outputs_staff_update"
  ON public.analytics_outputs
  FOR UPDATE
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

DROP POLICY IF EXISTS "analytics_outputs_staff_delete" ON public.analytics_outputs;
CREATE POLICY "analytics_outputs_staff_delete"
  ON public.analytics_outputs
  FOR DELETE
  TO public
  USING (public.is_dashboard_staff());
