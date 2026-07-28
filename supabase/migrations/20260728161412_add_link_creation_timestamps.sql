begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.links
  add column if not exists created_at timestamptz;

alter table public.links_archive
  add column if not exists created_at timestamptz;

-- Existing active rows have an exact insert event keyed by the links UUID. Avoid
-- emitting synthetic order.link.updated events while restoring that timestamp.
do $migration$
declare
  activity_trigger_was_enabled boolean := false;
begin
  select trigger.tgenabled = 'O'
    into activity_trigger_was_enabled
  from pg_trigger as trigger
  where trigger.tgrelid = 'public.links'::regclass
    and trigger.tgname = 'trg_links_activity_event'
    and not trigger.tgisinternal;

  if coalesce(activity_trigger_was_enabled, false) then
    execute 'alter table public.links disable trigger trg_links_activity_event';
  end if;

  begin
    with exact_creation as materialized (
      select
        event.details ->> 'link_id' as link_id,
        min(event.occurred_at) as created_at
      from public.activity_events as event
      where event.action = 'order.link.created'
        and event.details ->> 'source_table' = 'links'
        and nullif(event.details ->> 'link_id', '') is not null
      group by event.details ->> 'link_id'
    )
    update public.links as link
       set created_at = exact_creation.created_at
      from exact_creation
     where link.created_at is null
       and link.id::text = exact_creation.link_id;

    -- Fresh databases and historical environments may predate activity events.
    update public.links
       set created_at = statement_timestamp()
     where created_at is null;
  exception
    when others then
      if coalesce(activity_trigger_was_enabled, false) then
        execute 'alter table public.links enable trigger trg_links_activity_event';
      end if;
      raise;
  end;

  if coalesce(activity_trigger_was_enabled, false) then
    execute 'alter table public.links enable trigger trg_links_activity_event';
  end if;
end
$migration$;

alter table public.links
  alter column created_at set default now(),
  alter column created_at set not null;

create or replace function public.preserve_links_archive_created_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.created_at is null then
    select link.created_at
      into new.created_at
    from public.links as link
    where (
      new."ssOrderId" is not null
      and link."ssOrderId" = new."ssOrderId"
    ) or (
      new."ssOrderId" is null
      and new."orderId" is not null
      and link."orderId" = new."orderId"
    )
    order by link.created_at desc
    limit 1;
  end if;

  return new;
end
$function$;

revoke all on function public.preserve_links_archive_created_at() from public;

drop trigger if exists preserve_links_archive_created_at on public.links_archive;
create trigger preserve_links_archive_created_at
  before insert on public.links_archive
  for each row
  execute function public.preserve_links_archive_created_at();

-- Preserve only attributable historical archive dates. A later regenerated link
-- must not supply the timestamp for an earlier archive row.
with link_events as materialized (
  select event.entity_id, event.occurred_at
  from public.activity_events as event
  where event.action = 'order.link.created'
),
download_messages as materialized (
  select
    message.order_number,
    coalesce(message.sent_at, message.created_at) as created_at
  from public.order_email_messages as message
  where message.email_kind = 'download'
    and message.source_service = 'fophasetwo'
),
archive_creation as (
  select
    archive.id,
    max(link_event.occurred_at) as event_created_at,
    max(download_message.created_at) as email_created_at
  from public.links_archive as archive
  left join link_events as link_event
    on link_event.entity_id = archive."ssOrderId"::text
   and link_event.occurred_at <= archive.archived_at
  left join download_messages as download_message
    on download_message.order_number = archive."ssOrderId"::text
   and download_message.created_at <= archive.archived_at
  where archive.created_at is null
  group by archive.id
)
update public.links_archive as archive
   set created_at = coalesce(
     archive_creation.event_created_at,
     archive_creation.email_created_at
   )
  from archive_creation
 where archive.id = archive_creation.id
   and archive.created_at is null
   and coalesce(
     archive_creation.event_created_at,
     archive_creation.email_created_at
   ) is not null;

comment on column public.links.created_at is
  'Timestamp when the active download-link row was created.';

comment on column public.links_archive.created_at is
  'Original download-link creation timestamp preserved when the row was archived; null when legacy provenance is unavailable.';

create index if not exists links_created_at_idx
  on public.links (created_at desc);

create index if not exists links_archive_created_at_idx
  on public.links_archive (created_at desc);

commit;
