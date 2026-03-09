-- Config: minimum notice (in hours) required for members to reschedule bookings.
INSERT INTO public.system_config (key, value)
VALUES ('member_reschedule_notice_hours', '24'::jsonb)
ON CONFLICT (key) DO NOTHING;

