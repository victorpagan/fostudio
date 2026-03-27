-- =============================================================================
-- Google Calendar external sync storage + settings seeds
-- - Stores synced external calendar events (e.g. Peerspace mirror)
-- - Seeds system_config keys used by admin Google Calendar settings
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.external_calendar_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL,
  calendar_id      text NOT NULL,
  external_event_id text NOT NULL,
  title            text,
  description      text,
  location         text,
  status           text NOT NULL DEFAULT 'confirmed',
  start_time       timestamptz NOT NULL,
  end_time         timestamptz NOT NULL,
  active           boolean NOT NULL DEFAULT true,
  raw_payload      jsonb,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_calendar_events_time_order CHECK (end_time > start_time),
  CONSTRAINT external_calendar_events_provider_check CHECK (provider IN ('google'))
);

CREATE UNIQUE INDEX IF NOT EXISTS external_calendar_events_provider_event_uidx
  ON public.external_calendar_events(provider, calendar_id, external_event_id);

CREATE INDEX IF NOT EXISTS external_calendar_events_active_time_idx
  ON public.external_calendar_events(active, start_time, end_time);

CREATE INDEX IF NOT EXISTS external_calendar_events_provider_calendar_time_idx
  ON public.external_calendar_events(provider, calendar_id, start_time);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_external_calendar_events_updated_at'
  ) THEN
    CREATE TRIGGER trg_external_calendar_events_updated_at
      BEFORE UPDATE ON public.external_calendar_events
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.external_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "external_calendar_events: admin all" ON public.external_calendar_events;
CREATE POLICY "external_calendar_events: admin all"
  ON public.external_calendar_events FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.system_config (key, value) VALUES
  ('gcal_sync_enabled', 'false'::jsonb),
  ('gcal_calendar_id', '""'::jsonb),
  ('gcal_service_account_secret_name', '"GOOGLE_SERVICE_ACCOUNT_JSON"'::jsonb),
  ('gcal_sync_lookback_days', '14'::jsonb),
  ('gcal_sync_lookahead_days', '180'::jsonb),
  ('gcal_sync_interval_minutes', '5'::jsonb),
  ('gcal_last_sync_at', 'null'::jsonb),
  ('gcal_last_sync_status', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
