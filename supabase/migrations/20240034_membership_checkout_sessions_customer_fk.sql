-- =============================================================================
-- membership_checkout_sessions.customer_id canonical link to customers.id
-- =============================================================================

ALTER TABLE public.membership_checkout_sessions
  ADD COLUMN IF NOT EXISTS customer_id uuid;

-- Backfill from square_customer_id when available.
UPDATE public.membership_checkout_sessions s
SET customer_id = c.id
FROM public.customers c
WHERE s.customer_id IS NULL
  AND s.square_customer_id IS NOT NULL
  AND c.square_customer_id = s.square_customer_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'membership_checkout_sessions_customer_id_fkey'
      AND conrelid = 'public.membership_checkout_sessions'::regclass
  ) THEN
    ALTER TABLE public.membership_checkout_sessions
      ADD CONSTRAINT membership_checkout_sessions_customer_id_fkey
      FOREIGN KEY (customer_id)
      REFERENCES public.customers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS membership_checkout_sessions_customer_id_idx
  ON public.membership_checkout_sessions(customer_id);
