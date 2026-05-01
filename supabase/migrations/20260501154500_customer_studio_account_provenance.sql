ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS studio_account_origin text,
  ADD COLUMN IF NOT EXISTS studio_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS studio_last_seen_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_studio_account_origin_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_studio_account_origin_check
      CHECK (
        studio_account_origin IS NULL
        OR studio_account_origin IN (
          'studio_signup',
          'studio_checkout_signup',
          'studio_membership',
          'lab_shared_auth'
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS customers_studio_account_origin_idx
  ON public.customers (studio_account_origin);

CREATE INDEX IF NOT EXISTS customers_studio_last_seen_idx
  ON public.customers (studio_last_seen_at DESC);

WITH first_membership AS (
  SELECT user_id, min(created_at) AS first_membership_at
  FROM public.memberships
  WHERE user_id IS NOT NULL
  GROUP BY user_id
)
UPDATE public.customers c
SET
  studio_account_origin = COALESCE(c.studio_account_origin, 'studio_membership'),
  studio_registered_at = COALESCE(c.studio_registered_at, first_membership.first_membership_at, c.created_at),
  studio_last_seen_at = COALESCE(c.studio_last_seen_at, c.updated_at, first_membership.first_membership_at, c.created_at)
FROM first_membership
WHERE c.user_id = first_membership.user_id;
