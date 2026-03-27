drop view if exists "public"."credit_balance";

drop view if exists "public"."links_with_customers";

drop view if exists "public"."refund_queue_with_details";

drop view if exists "public"."orders_with_customers";

create or replace view "public"."credit_balance" as  SELECT credits_ledger.user_id,
    (COALESCE(sum(credits_ledger.delta), (0)::numeric))::numeric(10,2) AS balance
   FROM public.credits_ledger
  WHERE ((credits_ledger.expires_at IS NULL) OR (credits_ledger.expires_at > now()))
  GROUP BY credits_ledger.user_id;


create or replace view "public"."links_with_customers" as  SELECT l.id,
    l."orderId",
    l.link,
    l.expires_date,
    l.password,
    l.email,
    l."ssOrderId",
    c.id AS db_customer_id,
    c.square_customer_id,
    c.first_name,
    c.last_name,
    c.email AS customer_email,
    c.phone AS customer_phone,
    c.lab_notes
   FROM (public.links l
     LEFT JOIN public.customers c ON ((c.email = l.email)));


create or replace view "public"."orders_with_customers" as  SELECT o.id,
    o.created,
    o."customerId",
    o."orderId",
    o."ssOrderId",
    o."lineItems",
    o.total,
    o.state,
    o.type,
    o.name,
    o.email,
    o.phone,
    o."internalNotes",
    o."terminalStatus",
    o."locationId",
    o."squareOrderJSON",
    o.shipping_status,
    o.user_id,
    o.completed,
    o.pickedup,
    o."isServiceOrder",
    o."confirmationSent",
    o.refunded_amount,
    c.id AS db_customer_id,
    c.square_customer_id,
    c.first_name,
    c.last_name,
    c.email AS customer_email,
    c.phone AS customer_phone,
    c.lab_notes
   FROM (public.orders2 o
     LEFT JOIN public.customers c ON ((c.square_customer_id = o."customerId")));


create or replace view "public"."refund_queue_with_details" as  SELECT rq.id,
    rq.order_id,
    rq.order_db_id,
    rq.amount,
    rq.reason,
    rq.status,
    rq.initiated_by,
    rq.idempotency_key,
    rq.square_refund_id,
    rq.square_response,
    rq.error_message,
    rq.created_at,
    rq.processed_at,
    rq.updated_at,
    o2.total AS order_total,
    o2.refunded_amount AS order_refunded_amount,
    o2.state AS order_state,
    o2."customerId",
    o2."locationId",
    o2."squareOrderJSON",
    owc.first_name,
    owc.last_name,
    owc.customer_email
   FROM ((public.refund_queue rq
     JOIN public.orders2 o2 ON ((o2.id = rq.order_db_id)))
     LEFT JOIN public.orders_with_customers owc ON ((owc.id = rq.order_db_id)));
