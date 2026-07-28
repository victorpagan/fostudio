create or replace view public.service_instance_heartbeats_current
with (security_invoker = true)
as
select distinct on (service_key, instance_key)
  id,
  service,
  service_key,
  instance_key,
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
  and service_key is not null
  and service_key <> ''
  and instance_key is not null
  and instance_key <> ''
order by
  service_key,
  instance_key,
  started_at desc,
  id desc;

comment on view public.service_instance_heartbeats_current is
  'Latest durable heartbeat for each location- or host-scoped service instance.';

revoke all on table public.service_instance_heartbeats_current from public;
revoke all on table public.service_instance_heartbeats_current from anon;
revoke all on table public.service_instance_heartbeats_current from authenticated;
grant select on table public.service_instance_heartbeats_current to service_role;
