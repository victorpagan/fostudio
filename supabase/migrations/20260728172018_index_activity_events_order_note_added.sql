create index concurrently if not exists activity_events_order_note_added_idx
  on public.activity_events (order_db_id, id)
  where action = 'order.note.added'
    and order_db_id is not null;
