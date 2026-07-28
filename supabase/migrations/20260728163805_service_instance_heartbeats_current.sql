create or replace view public.service_instance_heartbeats_current
with (security_invoker = true)
as
select distinct on (lower(btrim(service_key)), btrim(instance_key))
  id,
  service,
  btrim(service_key) as service_key,
  btrim(instance_key) as instance_key,
  status,
  started_at,
  finished_at,
  coalesce(finished_at, started_at) as signal_at,
  message,
  environment,
  release,
  metadata
from public.service_runs
where run_type = 'heartbeat'
  and nullif(btrim(service_key), '') is not null
  and nullif(btrim(instance_key), '') is not null
order by
  lower(btrim(service_key)),
  btrim(instance_key),
  coalesce(finished_at, started_at) desc,
  started_at desc,
  id desc;

comment on view public.service_instance_heartbeats_current is
  'Latest durable heartbeat for each location- or host-scoped service instance.';

revoke all on table public.service_instance_heartbeats_current from public;
revoke all on table public.service_instance_heartbeats_current from anon;
revoke all on table public.service_instance_heartbeats_current from authenticated;
grant select on table public.service_instance_heartbeats_current to service_role;
