-- Admin incidents and expense reporting

CREATE TABLE IF NOT EXISTS public.admin_incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  description text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('safety', 'facility', 'equipment', 'access', 'billing', 'member', 'policy', 'other')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  member_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_expense_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  description text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('supplies', 'maintenance', 'contractor', 'utilities', 'software', 'refund', 'travel', 'other')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'paid')),
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  incurred_on date,
  vendor_name text NOT NULL DEFAULT '',
  receipt_urls text[] NOT NULL DEFAULT '{}'::text[],
  member_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  incident_id uuid REFERENCES public.admin_incident_reports(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejection_reason text,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_reference text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_incident_reports_status_created_idx
  ON public.admin_incident_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_incident_reports_severity_status_idx
  ON public.admin_incident_reports (severity, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS admin_incident_reports_member_idx
  ON public.admin_incident_reports (member_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS admin_incident_reports_occurred_idx
  ON public.admin_incident_reports (occurred_at DESC);

CREATE INDEX IF NOT EXISTS admin_expense_reports_status_created_idx
  ON public.admin_expense_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_expense_reports_incident_status_idx
  ON public.admin_expense_reports (incident_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS admin_expense_reports_member_idx
  ON public.admin_expense_reports (member_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS admin_expense_reports_incurred_idx
  ON public.admin_expense_reports (incurred_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_expense_reports_paid_idx
  ON public.admin_expense_reports (paid_at DESC) WHERE paid_at IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_incident_reports_updated_at'
  ) THEN
    CREATE TRIGGER trg_admin_incident_reports_updated_at
      BEFORE UPDATE ON public.admin_incident_reports
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_expense_reports_updated_at'
  ) THEN
    CREATE TRIGGER trg_admin_expense_reports_updated_at
      BEFORE UPDATE ON public.admin_expense_reports
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.admin_incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_expense_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_incident_reports_staff_all" ON public.admin_incident_reports;
CREATE POLICY "admin_incident_reports_staff_all"
  ON public.admin_incident_reports
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());

DROP POLICY IF EXISTS "admin_expense_reports_staff_all" ON public.admin_expense_reports;
CREATE POLICY "admin_expense_reports_staff_all"
  ON public.admin_expense_reports
  FOR ALL
  TO public
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());
