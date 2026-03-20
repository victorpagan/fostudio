-- Migration: 20240006_system_config_fostudio.sql
--
-- Seeds system_config keys needed by the fostudio app.
-- All runtime config (Square IDs, etc.) lives here — not in env vars —
-- so that all apps (fostudio, fohooks, fodashboard, fomailer) share a
-- single source of truth and can be updated without redeployment.
--
-- NOTE: Redirect URLs are derived from the request origin at runtime
-- (getRequestURL(event).origin) so no APP_BASE_URL config is needed.
--
-- Update values via the Supabase dashboard or another migration.

CREATE TABLE IF NOT EXISTS public.system_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.system_config (key, value)
VALUES
  -- Square location ID for the FO Studio location. Required for all payment link and order creation.
  ('SQUARE_STUDIO_LOCATION_ID', '"LMKTTKQG7R9JS"'::jsonb)

ON CONFLICT (key) DO NOTHING;
