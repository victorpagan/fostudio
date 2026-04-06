-- Analytics account classification flags for KPI filtering and controlled exclusion windows.
DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_internal_account boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS exclude_from_kpis boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL;

  CREATE INDEX IF NOT EXISTS idx_customers_exclude_from_kpis
    ON public.customers (exclude_from_kpis);

  CREATE INDEX IF NOT EXISTS idx_customers_kpi_expires_at
    ON public.customers (expires_at);
END
$$;
