-- Backfill immutable checkout price snapshots for paid membership sessions.
-- This ensures reporting uses charged-at-time amounts even if plan pricing changes later.

WITH session_prices AS (
  SELECT
    id,
    CASE
      WHEN COALESCE(metadata, '{}'::jsonb)->>'payment_amount_cents' ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN ROUND((COALESCE(metadata, '{}'::jsonb)->>'payment_amount_cents')::numeric)::int
      WHEN COALESCE(metadata, '{}'::jsonb)->>'effective_price_cents' ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN ROUND((COALESCE(metadata, '{}'::jsonb)->>'effective_price_cents')::numeric)::int
      WHEN (
        COALESCE(metadata, '{}'::jsonb)->>'base_price_cents' ~ '^-?[0-9]+(\.[0-9]+)?$'
        AND COALESCE(metadata, '{}'::jsonb)->>'promo_discount_cents' ~ '^-?[0-9]+(\.[0-9]+)?$'
      )
        THEN GREATEST(
          0,
          ROUND((COALESCE(metadata, '{}'::jsonb)->>'base_price_cents')::numeric)::int
          - ROUND((COALESCE(metadata, '{}'::jsonb)->>'promo_discount_cents')::numeric)::int
        )
      WHEN COALESCE(metadata, '{}'::jsonb)->>'base_price_cents' ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN ROUND((COALESCE(metadata, '{}'::jsonb)->>'base_price_cents')::numeric)::int
      ELSE NULL
    END AS charged_cents
  FROM public.membership_checkout_sessions
  WHERE paid_at IS NOT NULL
)
UPDATE public.membership_checkout_sessions target
SET metadata = COALESCE(target.metadata, '{}'::jsonb) || jsonb_build_object(
  'payment_amount_cents', source.charged_cents,
  'effective_price_cents', source.charged_cents,
  'base_price_cents', source.charged_cents
)
FROM session_prices source
WHERE source.id = target.id
  AND source.charged_cents IS NOT NULL
  AND (
    COALESCE(target.metadata, '{}'::jsonb)->>'payment_amount_cents' IS NULL
    OR COALESCE(target.metadata, '{}'::jsonb)->>'effective_price_cents' IS NULL
    OR COALESCE(target.metadata, '{}'::jsonb)->>'base_price_cents' IS NULL
  );
