insert into public.system_config (key, value)
values ('gcal_push_enabled', 'false'::jsonb)
on conflict (key) do nothing;
