-- Convert orders2.completed from nullable text semantics to boolean semantics.
DO $$
BEGIN
  IF to_regclass('public.orders2') IS NULL THEN
    RETURN;
  END IF;

  DROP VIEW IF EXISTS public.refund_queue_with_details;
  DROP VIEW IF EXISTS public.orders_with_customers;

  ALTER TABLE public.orders2
    ALTER COLUMN completed DROP DEFAULT;

  UPDATE public.orders2
  SET completed = CASE
    WHEN completed IS NULL THEN 'false'
    WHEN upper(completed) = 'COMPLETED' THEN 'true'
    ELSE 'false'
  END;

  ALTER TABLE public.orders2
    ALTER COLUMN completed TYPE boolean
    USING COALESCE(completed = 'true', false),
    ALTER COLUMN completed SET DEFAULT false,
    ALTER COLUMN completed SET NOT NULL;

  IF to_regclass('public.customers') IS NOT NULL THEN
    CREATE OR REPLACE VIEW public.orders_with_customers AS
    SELECT o.id,
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
    FROM public.orders2 o
      LEFT JOIN public.customers c ON c.square_customer_id = o."customerId";

    ALTER TABLE public.orders_with_customers OWNER TO postgres;
    GRANT ALL ON TABLE public.orders_with_customers TO anon;
    GRANT ALL ON TABLE public.orders_with_customers TO authenticated;
    GRANT ALL ON TABLE public.orders_with_customers TO service_role;
  END IF;

  IF to_regclass('public.refund_queue') IS NOT NULL AND to_regclass('public.orders_with_customers') IS NOT NULL THEN
    CREATE OR REPLACE VIEW public.refund_queue_with_details AS
    SELECT rq.id,
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
    FROM public.refund_queue rq
      JOIN public.orders2 o2 ON o2.id = rq.order_db_id
      LEFT JOIN public.orders_with_customers owc ON owc.id = rq.order_db_id;

    ALTER TABLE public.refund_queue_with_details OWNER TO postgres;
    GRANT ALL ON TABLE public.refund_queue_with_details TO anon;
    GRANT ALL ON TABLE public.refund_queue_with_details TO authenticated;
    GRANT ALL ON TABLE public.refund_queue_with_details TO service_role;
  END IF;
END
$$;
