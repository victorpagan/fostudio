-- Return grouped internal-note activity counts to trusted dashboard servers.
-- The function is deliberately invoker-rights and service-role-only: callers
-- do not gain any access beyond the activity_events privileges they hold.

create or replace function public.count_order_note_events(
  p_order_ids bigint[]
)
returns table (
  order_db_id bigint,
  note_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    event.order_db_id,
    count(*)::bigint as note_count
  from public.activity_events as event
  where event.order_db_id = any(coalesce(p_order_ids, array[]::bigint[]))
    and event.action = 'order.note.added'
  group by event.order_db_id
  order by event.order_db_id;
$function$;

revoke all on function public.count_order_note_events(bigint[]) from public;
revoke all on function public.count_order_note_events(bigint[]) from anon;
revoke all on function public.count_order_note_events(bigint[]) from authenticated;
grant execute on function public.count_order_note_events(bigint[]) to service_role;
