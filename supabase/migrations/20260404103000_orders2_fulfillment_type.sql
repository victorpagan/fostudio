-- Adds a normalized fulfillment type for orders2 and keeps it synced automatically.
-- Values:
--   shipping = order requires outbound shipping
--   pickup   = order does not require outbound shipping / pickup flow

create or replace function public.orders2_resolve_fulfillment_type(
  p_shipping_status text,
  p_fulfillment_meta jsonb,
  p_pickedup boolean
)
returns text
language plpgsql
immutable
as $$
declare
  v_status text := lower(coalesce(p_shipping_status, ''));
  v_outbound text := lower(coalesce(p_fulfillment_meta ->> 'outboundRequired', ''));
begin
  if v_status like '%shipstation%' then
    return 'shipping';
  end if;

  if v_outbound in ('true', 't', '1') then
    return 'shipping';
  end if;

  if coalesce(p_pickedup, false) then
    return 'pickup';
  end if;

  if v_status like '%pickup%' then
    return 'pickup';
  end if;

  return null;
end;
$$;

alter table public.orders2
  add column if not exists fulfillment_type text;

update public.orders2
set fulfillment_type = public.orders2_resolve_fulfillment_type(
  shipping_status,
  fulfillment_meta::jsonb,
  pickedup
);

create or replace function public.orders2_set_fulfillment_type()
returns trigger
language plpgsql
as $$
begin
  new.fulfillment_type := public.orders2_resolve_fulfillment_type(
    new.shipping_status,
    new.fulfillment_meta::jsonb,
    new.pickedup
  );
  return new;
end;
$$;

drop trigger if exists trg_orders2_set_fulfillment_type on public.orders2;

create trigger trg_orders2_set_fulfillment_type
before insert or update of shipping_status, fulfillment_meta, pickedup
on public.orders2
for each row
execute function public.orders2_set_fulfillment_type();

create index if not exists idx_orders2_fulfillment_type on public.orders2 (fulfillment_type);
