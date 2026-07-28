create index if not exists link_worker_requests_requested_by_idx
  on public.link_worker_requests (requested_by)
  where requested_by is not null;
