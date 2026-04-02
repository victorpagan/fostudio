-- Allow permanent door-code unlocks to trigger Abode disarm outside lab hours.
INSERT INTO public.system_config (key, value)
VALUES ('PERMANENT_CODES_DISARM_ABODE_OUTSIDE_LAB_HOURS', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
