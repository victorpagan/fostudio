-- Developer updates, GitHub repo timeline, and curated architecture map.

ALTER TABLE IF EXISTS public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_entity_type_check;

ALTER TABLE IF EXISTS public.activity_events
  ADD CONSTRAINT activity_events_entity_type_check
  CHECK (entity_type IN ('order', 'ticket', 'customer', 'staff', 'system', 'developer_update'));

CREATE TABLE IF NOT EXISTS public.developer_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'service' CHECK (kind IN ('app', 'service', 'external', 'database', 'storage')),
  repo_full_name text UNIQUE,
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'neutral',
  icon text NOT NULL DEFAULT 'i-lucide-box',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.developer_system_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system_id uuid NOT NULL REFERENCES public.developer_systems(id) ON DELETE CASCADE,
  target_system_id uuid NOT NULL REFERENCES public.developer_systems(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'depends_on',
  label text NOT NULL DEFAULT '',
  criticality text NOT NULL DEFAULT 'normal' CHECK (criticality IN ('low', 'normal', 'high', 'critical')),
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system_id, target_system_id, label)
);

CREATE TABLE IF NOT EXISTS public.developer_repo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  action text,
  repo_full_name text NOT NULL,
  repo_name text NOT NULL,
  system_id uuid REFERENCES public.developer_systems(id) ON DELETE SET NULL,
  branch text,
  ref text,
  commit_sha text,
  commit_url text,
  commit_count integer NOT NULL DEFAULT 0,
  changed_file_count integer NOT NULL DEFAULT 0,
  author_name text,
  author_email text,
  title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  html_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS developer_repo_events_repo_occurred_idx
  ON public.developer_repo_events (repo_full_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS developer_repo_events_system_occurred_idx
  ON public.developer_repo_events (system_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.developer_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  impact text NOT NULL DEFAULT 'normal' CHECK (impact IN ('low', 'normal', 'high', 'breaking')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  affected_summary text NOT NULL DEFAULT '',
  watch_notes text NOT NULL DEFAULT '',
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS developer_updates_status_published_idx
  ON public.developer_updates (status, published_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.developer_update_systems (
  update_id uuid NOT NULL REFERENCES public.developer_updates(id) ON DELETE CASCADE,
  system_id uuid NOT NULL REFERENCES public.developer_systems(id) ON DELETE CASCADE,
  PRIMARY KEY (update_id, system_id)
);

CREATE TABLE IF NOT EXISTS public.developer_update_repo_events (
  update_id uuid NOT NULL REFERENCES public.developer_updates(id) ON DELETE CASCADE,
  repo_event_id uuid NOT NULL REFERENCES public.developer_repo_events(id) ON DELETE CASCADE,
  PRIMARY KEY (update_id, repo_event_id)
);

CREATE TABLE IF NOT EXISTS public.developer_update_tickets (
  update_id uuid NOT NULL REFERENCES public.developer_updates(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.internal_errors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (update_id, ticket_id)
);

CREATE TABLE IF NOT EXISTS public.developer_update_reads (
  update_id uuid NOT NULL REFERENCES public.developer_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (update_id, user_id)
);

CREATE INDEX IF NOT EXISTS developer_update_reads_user_read_idx
  ON public.developer_update_reads (user_id, read_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_developer_systems_updated_at') THEN
    CREATE TRIGGER trg_developer_systems_updated_at
      BEFORE UPDATE ON public.developer_systems
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_developer_system_edges_updated_at') THEN
    CREATE TRIGGER trg_developer_system_edges_updated_at
      BEFORE UPDATE ON public.developer_system_edges
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_developer_updates_updated_at') THEN
    CREATE TRIGGER trg_developer_updates_updated_at
      BEFORE UPDATE ON public.developer_updates
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.developer_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_system_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_repo_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_update_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_update_repo_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_update_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_update_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "developer_systems_staff_read" ON public.developer_systems;
CREATE POLICY "developer_systems_staff_read"
  ON public.developer_systems FOR SELECT TO authenticated
  USING (public.is_dashboard_staff());

DROP POLICY IF EXISTS "developer_systems_admin_all" ON public.developer_systems;
CREATE POLICY "developer_systems_admin_all"
  ON public.developer_systems FOR ALL TO authenticated
  USING (public.has_app_role(ARRAY['admin', 'service']::text[]))
  WITH CHECK (public.has_app_role(ARRAY['admin', 'service']::text[]));

DROP POLICY IF EXISTS "developer_systems_service_all" ON public.developer_systems;
CREATE POLICY "developer_systems_service_all"
  ON public.developer_systems FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "developer_system_edges_staff_read" ON public.developer_system_edges;
CREATE POLICY "developer_system_edges_staff_read"
  ON public.developer_system_edges FOR SELECT TO authenticated
  USING (public.is_dashboard_staff());

DROP POLICY IF EXISTS "developer_system_edges_admin_all" ON public.developer_system_edges;
CREATE POLICY "developer_system_edges_admin_all"
  ON public.developer_system_edges FOR ALL TO authenticated
  USING (public.has_app_role(ARRAY['admin', 'service']::text[]))
  WITH CHECK (public.has_app_role(ARRAY['admin', 'service']::text[]));

DROP POLICY IF EXISTS "developer_system_edges_service_all" ON public.developer_system_edges;
CREATE POLICY "developer_system_edges_service_all"
  ON public.developer_system_edges FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "developer_repo_events_staff_read" ON public.developer_repo_events;
CREATE POLICY "developer_repo_events_staff_read"
  ON public.developer_repo_events FOR SELECT TO authenticated
  USING (public.is_dashboard_staff());

DROP POLICY IF EXISTS "developer_repo_events_service_all" ON public.developer_repo_events;
CREATE POLICY "developer_repo_events_service_all"
  ON public.developer_repo_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "developer_updates_staff_read_published" ON public.developer_updates;
CREATE POLICY "developer_updates_staff_read_published"
  ON public.developer_updates FOR SELECT TO authenticated
  USING (public.is_dashboard_staff() AND (status = 'published' OR public.has_app_role(ARRAY['admin', 'service']::text[])));

DROP POLICY IF EXISTS "developer_updates_admin_all" ON public.developer_updates;
CREATE POLICY "developer_updates_admin_all"
  ON public.developer_updates FOR ALL TO authenticated
  USING (public.has_app_role(ARRAY['admin', 'service']::text[]))
  WITH CHECK (public.has_app_role(ARRAY['admin', 'service']::text[]));

DROP POLICY IF EXISTS "developer_updates_service_all" ON public.developer_updates;
CREATE POLICY "developer_updates_service_all"
  ON public.developer_updates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "developer_update_joins_staff_read" ON public.developer_update_systems;
CREATE POLICY "developer_update_joins_staff_read"
  ON public.developer_update_systems FOR SELECT TO authenticated
  USING (public.is_dashboard_staff());

DROP POLICY IF EXISTS "developer_update_joins_service_all" ON public.developer_update_systems;
CREATE POLICY "developer_update_joins_service_all"
  ON public.developer_update_systems FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "developer_update_repo_events_staff_read" ON public.developer_update_repo_events;
CREATE POLICY "developer_update_repo_events_staff_read"
  ON public.developer_update_repo_events FOR SELECT TO authenticated
  USING (public.is_dashboard_staff());

DROP POLICY IF EXISTS "developer_update_repo_events_service_all" ON public.developer_update_repo_events;
CREATE POLICY "developer_update_repo_events_service_all"
  ON public.developer_update_repo_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "developer_update_tickets_staff_read" ON public.developer_update_tickets;
CREATE POLICY "developer_update_tickets_staff_read"
  ON public.developer_update_tickets FOR SELECT TO authenticated
  USING (public.is_dashboard_staff());

DROP POLICY IF EXISTS "developer_update_tickets_service_all" ON public.developer_update_tickets;
CREATE POLICY "developer_update_tickets_service_all"
  ON public.developer_update_tickets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "developer_update_reads_own_all" ON public.developer_update_reads;
CREATE POLICY "developer_update_reads_own_all"
  ON public.developer_update_reads FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_app_role(ARRAY['admin', 'service']::text[]))
  WITH CHECK (auth.uid() = user_id OR public.has_app_role(ARRAY['admin', 'service']::text[]));

DROP POLICY IF EXISTS "developer_update_reads_service_all" ON public.developer_update_reads;
CREATE POLICY "developer_update_reads_service_all"
  ON public.developer_update_reads FOR ALL TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO public.developer_systems (slug, name, kind, repo_full_name, description, color, icon, tags, sort_order)
VALUES
  ('fodashboard', 'FO Dashboard', 'app', 'victorpagan/fodashboard', 'Internal operations dashboard for orders, tickets, customers, links, staff, and management workflows.', 'sky', 'i-lucide-layout-dashboard', '["dashboard","staff","orders","tickets"]'::jsonb, 10),
  ('filmobjektiv', 'Film Objektiv', 'app', 'victorpagan/filmobjektiv', 'Public storefront, customer account area, checkout, and order tracking experience.', 'amber', 'i-lucide-globe', '["public site","checkout","tracking"]'::jsonb, 20),
  ('fostudio', 'FO Studio', 'app', 'victorpagan/fostudio', 'Studio/member platform and shared Supabase migration source.', 'teal', 'i-lucide-camera', '["studio","memberships","database"]'::jsonb, 30),
  ('fomailer', 'FO Mailer', 'service', 'victorpagan/fomailer', 'Transactional email service and SendGrid template handling.', 'rose', 'i-lucide-mail', '["email","sendgrid"]'::jsonb, 40),
  ('fohooks', 'FO Hooks', 'service', 'victorpagan/fohooks', 'Webhook service for Square/order lifecycle ingestion and automation.', 'violet', 'i-lucide-webhook', '["webhooks","orders"]'::jsonb, 50),
  ('foprint-daemon', 'FO Print Daemon', 'service', 'victorpagan/foprint-daemon', 'Print lifecycle worker for lab and order print jobs.', 'orange', 'i-lucide-printer', '["print","daemon"]'::jsonb, 60),
  ('fophasetwo', 'FO Phase Two', 'service', 'victorpagan/fophasetwo', 'Legacy scan link and post-processing workflows that still affect customer delivery.', 'lime', 'i-lucide-folders', '["links","scans","legacy"]'::jsonb, 70),
  ('supabase', 'Supabase', 'database', NULL, 'Shared database, auth, realtime, storage, and edge support.', 'emerald', 'i-lucide-database', '["source of truth","auth","realtime","storage"]'::jsonb, 100),
  ('square', 'Square', 'external', NULL, 'Orders, customers, payments, catalog, locations, and team member data.', 'neutral', 'i-lucide-square', '["orders","payments","team"]'::jsonb, 110),
  ('sendgrid', 'SendGrid', 'external', NULL, 'Email delivery and dynamic templates.', 'cyan', 'i-lucide-send', '["email","templates"]'::jsonb, 120),
  ('github', 'GitHub', 'external', NULL, 'Source control and webhook events used for developer updates.', 'slate', 'i-lucide-github', '["repos","deployments","updates"]'::jsonb, 130),
  ('heroku', 'Heroku', 'external', NULL, 'Runtime hosting for dashboard and service deployments.', 'purple', 'i-lucide-cloud', '["hosting","deployments"]'::jsonb, 140),
  ('storage', 'Storage', 'storage', NULL, 'Scan files, ticket images, generated assets, and customer delivery files.', 'indigo', 'i-lucide-hard-drive', '["files","scans","uploads"]'::jsonb, 150)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  repo_full_name = EXCLUDED.repo_full_name,
  description = EXCLUDED.description,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  tags = EXCLUDED.tags,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

WITH edge_seed(source_slug, target_slug, dependency_type, label, criticality, description, sort_order) AS (
  VALUES
    ('filmobjektiv', 'square', 'writes_to', 'Checkout and customer orders', 'critical', 'Public checkout creates Square orders and payments.', 10),
    ('square', 'fohooks', 'notifies', 'Order webhooks', 'critical', 'Square lifecycle webhooks feed FO Hooks.', 20),
    ('fohooks', 'supabase', 'writes_to', 'Order lifecycle activity', 'critical', 'Webhook outcomes are recorded into shared order/activity tables.', 30),
    ('fodashboard', 'supabase', 'reads_writes', 'Staff operations data', 'critical', 'Dashboard reads and mutates internal operational state.', 40),
    ('fodashboard', 'square', 'reads_writes', 'Order, customer, and staff actions', 'high', 'Dashboard calls Square for order, refund, customer, and team member workflows.', 50),
    ('fodashboard', 'fomailer', 'calls', 'Mail handlers', 'high', 'Dashboard uses mail handlers for staff invites and operational emails.', 60),
    ('fomailer', 'sendgrid', 'sends', 'Transactional email delivery', 'critical', 'Mailer sends SendGrid-backed transactional email.', 70),
    ('foprint-daemon', 'supabase', 'polls', 'Print jobs', 'normal', 'Print daemon reads and updates print lifecycle records.', 80),
    ('fophasetwo', 'storage', 'writes_to', 'Scan delivery files', 'high', 'Legacy scan workflows publish customer delivery assets.', 90),
    ('fophasetwo', 'supabase', 'writes_to', 'Link lifecycle', 'high', 'Legacy scan link lifecycle is captured into shared link tables.', 100),
    ('github', 'fodashboard', 'notifies', 'Developer update webhooks', 'normal', 'Repository activity feeds the developer updates dashboard.', 110),
    ('fodashboard', 'heroku', 'runs_on', 'Dashboard runtime', 'normal', 'Dashboard deployments run on Heroku.', 120)
)
INSERT INTO public.developer_system_edges (
  source_system_id,
  target_system_id,
  dependency_type,
  label,
  criticality,
  description,
  sort_order
)
SELECT
  source_system.id,
  target_system.id,
  edge_seed.dependency_type,
  edge_seed.label,
  edge_seed.criticality,
  edge_seed.description,
  edge_seed.sort_order
FROM edge_seed
JOIN public.developer_systems source_system ON source_system.slug = edge_seed.source_slug
JOIN public.developer_systems target_system ON target_system.slug = edge_seed.target_slug
ON CONFLICT (source_system_id, target_system_id, label) DO UPDATE SET
  dependency_type = EXCLUDED.dependency_type,
  criticality = EXCLUDED.criticality,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;
