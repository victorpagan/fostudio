DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Admin full access" ON public.customers;
  DROP POLICY IF EXISTS "admins can read customers" ON public.customers;
  DROP POLICY IF EXISTS "customers_admin_read_all" ON public.customers;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customers'
      AND policyname = 'customers_select_own_or_staff'
  ) THEN
    CREATE POLICY "customers_select_own_or_staff"
      ON public.customers
      FOR SELECT
      TO public
      USING ((auth.uid() = user_id) OR public.is_dashboard_staff());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customers'
      AND policyname = 'customers_insert_own_or_staff'
  ) THEN
    CREATE POLICY "customers_insert_own_or_staff"
      ON public.customers
      FOR INSERT
      TO public
      WITH CHECK ((auth.uid() = user_id) OR public.is_dashboard_staff());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customers'
      AND policyname = 'customers_update_own_or_staff'
  ) THEN
    CREATE POLICY "customers_update_own_or_staff"
      ON public.customers
      FOR UPDATE
      TO public
      USING ((auth.uid() = user_id) OR public.is_dashboard_staff())
      WITH CHECK ((auth.uid() = user_id) OR public.is_dashboard_staff());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customers'
      AND policyname = 'customers_delete_staff'
  ) THEN
    CREATE POLICY "customers_delete_staff"
      ON public.customers
      FOR DELETE
      TO public
      USING (public.is_dashboard_staff());
  END IF;
END
$$;
