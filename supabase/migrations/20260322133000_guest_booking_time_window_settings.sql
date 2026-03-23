-- =============================================================================
-- Guest booking daypart settings
-- - Configurable booking start/end hour for guest bookings (LA local time)
-- =============================================================================

INSERT INTO public.system_config (key, value)
VALUES
  ('guest_booking_start_hour', '11'::jsonb),
  ('guest_booking_end_hour', '19'::jsonb)
ON CONFLICT (key) DO NOTHING;
