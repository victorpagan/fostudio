-- Dashboard role hardening:
-- - Standardize role checks on auth.users.app_metadata only.
-- - Add reusable helper functions for role checks.
-- - Replace unsafe/duplicate policies that depended on user_metadata role values.

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(lower(auth.jwt() -> 'app_metadata' ->> 'user_role'), ''),
    NULLIF(lower(auth.jwt() -> 'app_metadata' ->> 'role'), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.has_app_role(allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(public.current_app_role() = ANY (allowed_roles), false);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.has_app_role(ARRAY['admin', 'service']::text[]);
$$;

CREATE OR REPLACE FUNCTION public.is_dashboard_staff()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.has_app_role(ARRAY['admin', 'ops', 'manager', 'support', 'viewer', 'service']::text[]);
$$;

DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Customers: User can insert their own record" ON public.customers;
    DROP POLICY IF EXISTS "Customers: User can select their record" ON public.customers;
    DROP POLICY IF EXISTS "Customers: User can update their record" ON public.customers;
    DROP POLICY IF EXISTS "admins can read customers" ON public.customers;
    DROP POLICY IF EXISTS "customers_insert_own" ON public.customers;
    DROP POLICY IF EXISTS "customers_select_own" ON public.customers;
    DROP POLICY IF EXISTS "customers_update_own" ON public.customers;
    DROP POLICY IF EXISTS "customers: own row read" ON public.customers;
    DROP POLICY IF EXISTS "customers: own row update" ON public.customers;
    DROP POLICY IF EXISTS "customers_select_own_or_staff" ON public.customers;
    DROP POLICY IF EXISTS "customers_insert_own_or_staff" ON public.customers;
    DROP POLICY IF EXISTS "customers_update_own_or_staff" ON public.customers;
    DROP POLICY IF EXISTS "customers_delete_staff" ON public.customers;

    CREATE POLICY "customers_select_own_or_staff"
      ON public.customers
      FOR SELECT
      TO public
      USING ((auth.uid() = user_id) OR public.is_dashboard_staff());

    CREATE POLICY "customers_insert_own_or_staff"
      ON public.customers
      FOR INSERT
      TO public
      WITH CHECK ((auth.uid() = user_id) OR public.is_dashboard_staff());

    CREATE POLICY "customers_update_own_or_staff"
      ON public.customers
      FOR UPDATE
      TO public
      USING ((auth.uid() = user_id) OR public.is_dashboard_staff())
      WITH CHECK ((auth.uid() = user_id) OR public.is_dashboard_staff());

    CREATE POLICY "customers_delete_staff"
      ON public.customers
      FOR DELETE
      TO public
      USING (public.is_dashboard_staff());
  END IF;

  IF to_regclass('public.orders2') IS NOT NULL THEN
    ALTER TABLE public.orders2 ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Admin full access" ON public.orders2;
    DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders2;
    DROP POLICY IF EXISTS "orders2_staff_full_access" ON public.orders2;
    DROP POLICY IF EXISTS "orders2_select_own" ON public.orders2;

    CREATE POLICY "orders2_staff_full_access"
      ON public.orders2
      FOR ALL
      TO public
      USING (public.is_dashboard_staff())
      WITH CHECK (public.is_dashboard_staff());

    CREATE POLICY "orders2_select_own"
      ON public.orders2
      FOR SELECT
      TO public
      USING ((auth.role() = 'authenticated'::text) AND (user_id = auth.uid()));
  END IF;

  IF to_regclass('public.service_categories') IS NOT NULL THEN
    ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Admin full access" ON public.service_categories;
    DROP POLICY IF EXISTS "service_categories_admin_ops_full_access" ON public.service_categories;

    CREATE POLICY "service_categories_admin_ops_full_access"
      ON public.service_categories
      FOR ALL
      TO public
      USING (public.has_app_role(ARRAY['admin', 'ops', 'service']::text[]))
      WITH CHECK (public.has_app_role(ARRAY['admin', 'ops', 'service']::text[]));
  END IF;
END
$$;
