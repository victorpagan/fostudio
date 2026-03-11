ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS square_discount_id text;

CREATE INDEX IF NOT EXISTS promo_codes_square_discount_idx
  ON public.promo_codes(square_discount_id)
  WHERE square_discount_id IS NOT NULL;

ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_applies_to_check;

ALTER TABLE public.promo_codes
  ADD CONSTRAINT promo_codes_applies_to_check
  CHECK (applies_to IN ('all', 'membership', 'credits', 'holds'));
