-- =============================================================================
-- Reconcile legacy membership flow schema
-- - Some live environments were built manually before CLI migrations existed.
-- - Additive only: backfills missing columns / enum values / indexes used by
--   the current app and webhook worker.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Legacy enums still in use on some environments
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'membership_status'
  ) THEN
    ALTER TYPE public.membership_status ADD VALUE IF NOT EXISTS 'inactive';
    ALTER TYPE public.membership_status ADD VALUE IF NOT EXISTS 'paused';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. customers
-- ---------------------------------------------------------------------------

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address jsonb,
  ADD COLUMN IF NOT EXISTS lab_notes text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS square_customer_id text,
  ADD COLUMN IF NOT EXISTS square_customer_json jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS customers_user_id_idx
  ON public.customers(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_square_customer_id_idx
  ON public.customers(square_customer_id)
  WHERE square_customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. membership catalog tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.membership_tiers
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS booking_window_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS peak_multiplier numeric(4,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS max_bank integer,
  ADD COLUMN IF NOT EXISTS max_slots integer,
  ADD COLUMN IF NOT EXISTS holds_included integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.membership_plan_variations
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'square',
  ADD COLUMN IF NOT EXISTS provider_plan_id text,
  ADD COLUMN IF NOT EXISTS provider_plan_variation_id text,
  ADD COLUMN IF NOT EXISTS credits_per_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS discount_label text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 4. memberships
-- ---------------------------------------------------------------------------

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS square_subscription_id text,
  ADD COLUMN IF NOT EXISTS square_plan_variation_id text,
  ADD COLUMN IF NOT EXISTS square_customer_id text,
  ADD COLUMN IF NOT EXISTS checkout_provider text,
  ADD COLUMN IF NOT EXISTS checkout_payment_link_id text,
  ADD COLUMN IF NOT EXISTS checkout_order_template_id text,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_customer_id text,
  ADD COLUMN IF NOT EXISTS billing_provider text,
  ADD COLUMN IF NOT EXISTS billing_subscription_id text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS last_invoice_id text,
  ADD COLUMN IF NOT EXISTS last_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS memberships_status_idx ON public.memberships(status);
CREATE INDEX IF NOT EXISTS memberships_tier_idx ON public.memberships(tier);

UPDATE public.memberships
SET status = 'canceled'
WHERE status::text = 'cancelled';

ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_status_check;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_status_check CHECK (
    status::text = ANY (ARRAY[
      'pending_checkout'::text,
      'active'::text,
      'past_due'::text,
      'canceled'::text,
      'inactive'::text,
      'paused'::text
    ])
  );

-- ---------------------------------------------------------------------------
-- 5. credits_ledger
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.credit_balance;

ALTER TABLE public.credits_ledger
  ADD COLUMN IF NOT EXISTS external_ref text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.credits_ledger
  ALTER COLUMN delta TYPE numeric(10,2) USING delta::numeric(10,2);

CREATE INDEX IF NOT EXISTS credits_ledger_user_id_idx
  ON public.credits_ledger(user_id);

CREATE INDEX IF NOT EXISTS credits_ledger_created_at_idx
  ON public.credits_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credits_ledger_membership_id_idx
  ON public.credits_ledger(membership_id);

CREATE VIEW public.credit_balance AS
  SELECT
    user_id,
    COALESCE(SUM(delta), 0)::numeric(10,2) AS balance
  FROM public.credits_ledger
  WHERE expires_at IS NULL OR expires_at > now()
  GROUP BY user_id;

GRANT SELECT ON public.credit_balance TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. bookings
-- ---------------------------------------------------------------------------

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS credits_estimated numeric(8,2),
  ADD COLUMN IF NOT EXISTS credits_burned numeric(8,2),
  ADD COLUMN IF NOT EXISTS credits_final numeric(8,2),
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS square_order_id text,
  ADD COLUMN IF NOT EXISTS time_range tstzrange,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS bookings_user_id_idx
  ON public.bookings(user_id);

CREATE INDEX IF NOT EXISTS bookings_start_time_idx
  ON public.bookings(start_time);

CREATE INDEX IF NOT EXISTS bookings_status_idx
  ON public.bookings(status);

UPDATE public.bookings
SET status = 'canceled'
WHERE status = 'cancelled';

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check CHECK (
    status = ANY (ARRAY[
      'requested'::text,
      'confirmed'::text,
      'canceled'::text,
      'completed'::text,
      'declined'::text,
      'pending_payment'::text,
      'no_show'::text
    ])
  );

-- ---------------------------------------------------------------------------
-- 7. Shared trigger helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
