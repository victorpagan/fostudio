-- =============================================================================
-- Home Assistant provider defaults for lock access sync
-- =============================================================================

INSERT INTO public.system_config (key, value)
VALUES
  ('LOCK_PROVIDER_MODE', '"generic_webhook"'::jsonb),
  ('ABODE_PROVIDER_MODE', '"webhook"'::jsonb),
  ('HOME_ASSISTANT_BASE_URL', '""'::jsonb),
  ('HOME_ASSISTANT_LOCK_ENTITY_ID', '""'::jsonb),
  ('HOME_ASSISTANT_ABODE_ALARM_ENTITY_ID', '""'::jsonb),
  ('HOME_ASSISTANT_ABODE_UNLOCK_ACTION', '"alarm_control_panel.alarm_disarm"'::jsonb),
  ('HOME_ASSISTANT_ABODE_ARM_AWAY_ACTION', '"alarm_control_panel.alarm_arm_away"'::jsonb),
  ('ABODE_AUTOMATION_TIMEOUT_MS', '8000'::jsonb)
ON CONFLICT (key) DO NOTHING;
