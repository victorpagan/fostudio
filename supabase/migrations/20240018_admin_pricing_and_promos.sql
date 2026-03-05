-- =============================================================================
-- Admin pricing + promotions management
-- - credit_pricing_options: sellable credit bundles with scheduled discounts
-- - promo_codes: generic promo management table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.credit_pricing_options (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key               text NOT NULL UNIQUE,
  label             text NOT NULL,
  description       text,
  credits           numeric(8,2) NOT NULL CHECK (credits > 0),
  base_price_cents  integer NOT NULL CHECK (base_price_cents > 0),
  sale_price_cents  integer CHECK (sale_price_cents > 0),
  sale_starts_at    timestamptz,
  sale_ends_at      timestamptz,
  active            boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  square_item_id    text,
  square_variation_id text,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_pricing_options_key_format CHECK (key ~ '^[a-z0-9_]+$'),
  CONSTRAINT credit_pricing_options_sale_period CHECK (
    sale_starts_at IS NULL
    OR sale_ends_at IS NULL
    OR sale_ends_at > sale_starts_at
  ),
  CONSTRAINT credit_pricing_options_sale_price CHECK (
    sale_price_cents IS NULL OR sale_price_cents <= base_price_cents
  )
);

CREATE INDEX IF NOT EXISTS credit_pricing_options_active_sort_idx
  ON public.credit_pricing_options(active, sort_order, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_credit_pricing_options_updated_at'
  ) THEN
    CREATE TRIGGER trg_credit_pricing_options_updated_at
      BEFORE UPDATE ON public.credit_pricing_options
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.credit_pricing_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_pricing_options: active read" ON public.credit_pricing_options;
CREATE POLICY "credit_pricing_options: active read"
  ON public.credit_pricing_options FOR SELECT
  USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS "credit_pricing_options: admin write" ON public.credit_pricing_options;
CREATE POLICY "credit_pricing_options: admin write"
  ON public.credit_pricing_options FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.credit_pricing_options (
  key, label, description, credits, base_price_cents, sort_order, active
) VALUES
  ('single', '1 credit', 'Single credit top-up', 1, 4000, 1, true),
  ('bundle_3', '3 credits', 'Three-credit bundle', 3, 12000, 2, true),
  ('bundle_5', '5 credits', 'Five-credit bundle', 5, 19000, 3, true),
  ('bundle_10', '10 credits', 'Ten-credit bundle', 10, 36000, 4, true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  credits = EXCLUDED.credits,
  base_price_cents = EXCLUDED.base_price_cents,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE,
  description      text,
  discount_type    text NOT NULL CHECK (discount_type IN ('percent', 'fixed_cents')),
  discount_value   numeric(10,2) NOT NULL CHECK (discount_value > 0),
  applies_to       text NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all', 'membership', 'credits')),
  active           boolean NOT NULL DEFAULT true,
  starts_at        timestamptz,
  ends_at          timestamptz,
  max_redemptions  integer CHECK (max_redemptions IS NULL OR max_redemptions >= 0),
  redemptions_count integer NOT NULL DEFAULT 0 CHECK (redemptions_count >= 0),
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_code_upper CHECK (code = upper(code)),
  CONSTRAINT promo_codes_period CHECK (
    starts_at IS NULL
    OR ends_at IS NULL
    OR ends_at > starts_at
  )
);

CREATE INDEX IF NOT EXISTS promo_codes_active_idx
  ON public.promo_codes(active, starts_at, ends_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_promo_codes_updated_at'
  ) THEN
    CREATE TRIGGER trg_promo_codes_updated_at
      BEFORE UPDATE ON public.promo_codes
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promo_codes: admin readwrite" ON public.promo_codes;
CREATE POLICY "promo_codes: admin readwrite"
  ON public.promo_codes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

