ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS default_square_card_id text;

CREATE INDEX IF NOT EXISTS customers_default_square_card_idx
  ON public.customers(default_square_card_id)
  WHERE default_square_card_id IS NOT NULL;
