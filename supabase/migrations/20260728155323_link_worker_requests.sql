create table if not exists public.link_worker_requests (
  id uuid primary key default gen_random_uuid(),
  operation_key uuid not null unique,
  order_db_id bigint not null references public.orders2(id) on delete cascade,
  order_number bigint not null,
  square_order_id text not null,
  location_id text not null,
  action text not null check (action in ('resend', 'regenerate')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed')),
  send_email boolean not null default true,
  attempts integer not null default 0 check (attempts >= 0),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  completed_at timestamptz,
  last_error text,
  result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result) = 'object'),
  updated_at timestamptz not null default now()
);

create index if not exists link_worker_requests_poll_idx
  on public.link_worker_requests (status, requested_at)
  where status in ('pending', 'processing');

create index if not exists link_worker_requests_order_history_idx
  on public.link_worker_requests (order_db_id, requested_at desc);

create unique index if not exists link_worker_requests_active_action_idx
  on public.link_worker_requests (order_db_id, action)
  where status in ('pending', 'processing');

alter table public.link_worker_requests enable row level security;
revoke all on table public.link_worker_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.link_worker_requests to service_role;

drop policy if exists "link_worker_requests_service_all" on public.link_worker_requests;
create policy "link_worker_requests_service_all"
  on public.link_worker_requests for all to service_role
  using (true) with check (true);

create or replace function public.replace_link_for_worker(
  p_request_id uuid,
  p_ss_order_id bigint,
  p_order_id text,
  p_email text,
  p_location_id text,
  p_link text,
  p_password text,
  p_expires_at timestamptz,
  p_expected_current_link text,
  p_old_synology_link_id text,
  p_new_synology_link_id text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_link public.links%rowtype;
  replacement_id uuid;
begin
  if p_request_id is null
     or p_ss_order_id is null
     or p_order_id is null
     or btrim(p_order_id) = ''
     or p_location_id is null
     or btrim(p_location_id) = ''
     or p_link is null
     or btrim(p_link) = ''
     or p_expires_at is null then
    raise exception using errcode = '22023', message = 'invalid replacement link payload';
  end if;

  select * into current_link
  from public.links
  where "ssOrderId" = p_ss_order_id
  for update;

  if found then
    if current_link.link is distinct from p_expected_current_link then
      raise exception using errcode = '40001', message = 'download link changed before replacement';
    end if;

    if current_link."orderId" is not null
       and current_link."orderId" is distinct from p_order_id then
      raise exception using errcode = '22023', message = 'download link order identity mismatch';
    end if;

    insert into public.links_archive (
      reason,
      "ssOrderId",
      "orderId",
      email,
      link,
      password,
      expires_date,
      source,
      synology_link_id,
      synology_name,
      metadata,
      created_at
    ) values (
      'regenerated',
      current_link."ssOrderId",
      current_link."orderId",
      current_link.email,
      current_link.link,
      current_link.password,
      case
        when current_link.expires_date is null then null
        else current_link.expires_date at time zone 'UTC'
      end,
      current_link.source,
      p_old_synology_link_id,
      p_ss_order_id::text,
      jsonb_build_object(
        'request_id', p_request_id,
        'replacement_synology_link_id', p_new_synology_link_id
      ),
      current_link.created_at
    );

    update public.links
    set "orderId" = p_order_id,
        email = p_email,
        "locationId" = p_location_id,
        link = p_link,
        password = p_password,
        expires_date = p_expires_at at time zone 'UTC',
        source = 'square',
        created_at = now()
    where id = current_link.id
    returning id into replacement_id;
  else
    if p_expected_current_link is not null then
      raise exception using errcode = '40001', message = 'download link disappeared before replacement';
    end if;

    insert into public.links (
      "ssOrderId",
      "orderId",
      email,
      "locationId",
      link,
      password,
      expires_date,
      source,
      created_at
    ) values (
      p_ss_order_id,
      p_order_id,
      p_email,
      p_location_id,
      p_link,
      p_password,
      p_expires_at at time zone 'UTC',
      'square',
      now()
    )
    returning id into replacement_id;
  end if;

  return replacement_id;
end;
$$;

revoke all on function public.replace_link_for_worker(
  uuid, bigint, text, text, text, text, text, timestamptz, text, text, text
) from public, anon, authenticated;
grant execute on function public.replace_link_for_worker(
  uuid, bigint, text, text, text, text, text, timestamptz, text, text, text
) to service_role;

comment on table public.link_worker_requests is
  'Service-role queue for dashboard-requested Synology download-link resend and regeneration work.';
comment on function public.replace_link_for_worker(
  uuid, bigint, text, text, text, text, text, timestamptz, text, text, text
) is 'Atomically archives and replaces the active Square-order download link for a claimed worker request.';
