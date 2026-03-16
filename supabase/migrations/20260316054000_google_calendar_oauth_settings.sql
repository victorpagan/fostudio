insert into public.system_config (key, value)
values
  ('gcal_oauth_client_id', '""'::jsonb),
  ('gcal_oauth_client_secret_name', '"GOOGLE_OAUTH_CLIENT_SECRET"'::jsonb),
  ('gcal_oauth_refresh_token', 'null'::jsonb),
  ('gcal_oauth_access_token', 'null'::jsonb),
  ('gcal_oauth_access_token_expires_at', 'null'::jsonb),
  ('gcal_oauth_connected_email', '""'::jsonb),
  ('gcal_oauth_state', 'null'::jsonb),
  ('gcal_oauth_state_expires_at', 'null'::jsonb)
on conflict (key) do nothing;
