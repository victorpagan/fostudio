INSERT INTO public.system_config (key, value) VALUES
  ('analytics_ads_sync_enabled', 'false'::jsonb),
  ('analytics_ads_lookback_days', '30'::jsonb),
  ('analytics_ads_google_enabled', 'false'::jsonb),
  ('analytics_ads_google_customer_id', '""'::jsonb),
  ('analytics_ads_google_login_customer_id', '""'::jsonb),
  ('analytics_ads_google_api_version', '"v19"'::jsonb),
  ('analytics_ads_google_developer_token_secret_name', '"GOOGLE_ADS_DEVELOPER_TOKEN"'::jsonb),
  ('analytics_ads_google_client_id_secret_name', '"GOOGLE_ADS_CLIENT_ID"'::jsonb),
  ('analytics_ads_google_client_secret_secret_name', '"GOOGLE_ADS_CLIENT_SECRET"'::jsonb),
  ('analytics_ads_google_refresh_token_secret_name', '"GOOGLE_ADS_REFRESH_TOKEN"'::jsonb),
  ('analytics_ads_meta_enabled', 'false'::jsonb),
  ('analytics_ads_meta_ad_account_id', '""'::jsonb),
  ('analytics_ads_meta_api_version', '"v25.0"'::jsonb),
  ('analytics_ads_meta_access_token_secret_name', '"META_MARKETING_ACCESS_TOKEN"'::jsonb),
  ('analytics_ads_meta_conversion_action_types', '["lead","onsite_conversion.lead_grouped","purchase","onsite_conversion.purchase","offsite_conversion.purchase","offsite_conversion.fb_pixel_purchase"]'::jsonb),
  ('analytics_ads_last_sync_at', 'null'::jsonb),
  ('analytics_ads_last_sync_status', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
