-- Recompute quarterly/annual membership cycle prices from each tier's monthly
-- base price and the cadence discount_label so stored pricing stays consistent
-- with checkout/session pricing math.
WITH monthly_base AS (
  SELECT
    tier_id,
    price_cents AS monthly_price_cents
  FROM public.membership_plan_variations
  WHERE provider = 'square'
    AND active = true
    AND cadence = 'monthly'
),
targets AS (
  SELECT
    v.id,
    v.tier_id,
    v.cadence,
    v.price_cents AS current_price_cents,
    v.discount_label,
    mb.monthly_price_cents,
    CASE v.cadence
      WHEN 'quarterly' THEN 3
      WHEN 'annual' THEN 12
      ELSE 1
    END AS cadence_months,
    regexp_match(COALESCE(v.discount_label, ''), '(-?\d+(?:\.\d+)?)\s*%') AS percent_match,
    regexp_match(COALESCE(v.discount_label, ''), '\$\s*(-?\d+(?:\.\d+)?)') AS dollar_match
  FROM public.membership_plan_variations v
  JOIN monthly_base mb ON mb.tier_id = v.tier_id
  WHERE v.provider = 'square'
    AND v.active = true
    AND v.cadence IN ('quarterly', 'annual')
),
computed AS (
  SELECT
    id,
    current_price_cents,
    CASE
      WHEN percent_match IS NOT NULL THEN
        ROUND(
          monthly_price_cents
          * cadence_months
          * (
            1
            - LEAST(
              100,
              GREATEST(0, (percent_match[1])::numeric)
            ) / 100.0
          )
        )::int
      WHEN dollar_match IS NOT NULL THEN
        GREATEST(
          0,
          ROUND(
            monthly_price_cents * cadence_months
            - ((dollar_match[1])::numeric * 100)
          )::int
        )
      ELSE
        ROUND(monthly_price_cents * cadence_months)::int
    END AS expected_price_cents
  FROM targets
)
UPDATE public.membership_plan_variations v
SET price_cents = c.expected_price_cents
FROM computed c
WHERE v.id = c.id
  AND v.price_cents IS DISTINCT FROM c.expected_price_cents;
