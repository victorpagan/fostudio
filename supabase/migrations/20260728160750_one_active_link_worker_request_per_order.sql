drop index if exists public.link_worker_requests_active_action_idx;

create unique index if not exists link_worker_requests_active_order_idx
  on public.link_worker_requests (order_db_id)
  where status in ('pending', 'processing');
