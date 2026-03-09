-- =============================================================================
-- memberships.customer_id canonical link to customers.id
-- - Keep provider ids (square_customer_id / billing_customer_id) as snapshots
--   for compatibility/audit, but source identity from customers table.
-- =============================================================================

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS customer_id uuid;

-- Create missing customer rows for existing memberships/users.
INSERT INTO public.customers (user_id, email, created_at, updated_at)
SELECT
  m.user_id,
  lower(u.email::text),
  now(),
  now()
FROM public.memberships m
LEFT JOIN public.customers c
  ON c.user_id = m.user_id
LEFT JOIN auth.users u
  ON u.id = m.user_id
WHERE c.id IS NULL;

-- Backfill membership.customer_id to newest customer row per user.
WITH ranked_customers AS (
  SELECT
    c.id,
    c.user_id,
    row_number() OVER (
      PARTITION BY c.user_id
      ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST, c.id DESC
    ) AS rn
  FROM public.customers c
  WHERE c.user_id IS NOT NULL
)
UPDATE public.memberships m
SET customer_id = rc.id
FROM ranked_customers rc
WHERE rc.rn = 1
  AND m.user_id = rc.user_id
  AND (m.customer_id IS DISTINCT FROM rc.id);

-- Keep historical provider id columns hydrated from canonical customer row.
UPDATE public.memberships m
SET
  square_customer_id = COALESCE(m.square_customer_id, c.square_customer_id),
  billing_customer_id = COALESCE(m.billing_customer_id, c.square_customer_id),
  updated_at = now()
FROM public.customers c
WHERE m.customer_id = c.id
  AND (m.square_customer_id IS NULL OR m.billing_customer_id IS NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memberships_customer_id_fkey'
      AND conrelid = 'public.memberships'::regclass
  ) THEN
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_customer_id_fkey
      FOREIGN KEY (customer_id)
      REFERENCES public.customers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS memberships_customer_id_idx
  ON public.memberships(customer_id);
