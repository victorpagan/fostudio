-- =============================================================================
-- Legacy customers bootstrap
-- - Local resets need a base customers table before later migrations extend it.
-- - Production already had this table from the prior project, so this is
--   intentionally additive and safe to rerun.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email               text,
  phone               text,
  address             jsonb,
  lab_notes           text,
  first_name          text,
  last_name           text,
  square_customer_id  text,
  square_customer_json jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_key
  ON public.customers(user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_square_customer_id_key
  ON public.customers(square_customer_id)
  WHERE square_customer_id IS NOT NULL;
