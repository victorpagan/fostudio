-- Seed tracking URL config keys used by fohooks order confirmation payloads.
--
-- ORDER_TRACKING_BASE_URL
--   Global fallback base URL for order tracking links.
--   Example value: "https://track.example.com"
--
-- ORDER_TRACKING_BASE_URL_BY_LOCATION
--   Optional per-location override map.
--   Example value: {"LOCATION_ID_A":"https://la-track.example.com"}

insert into system_config (key, value)
values
  ('ORDER_TRACKING_BASE_URL', '"https://track.example.com"'::jsonb),
  ('ORDER_TRACKING_BASE_URL_BY_LOCATION', '{}'::jsonb)
on conflict (key)
do update set
  value = excluded.value,
  updated_at = now();
