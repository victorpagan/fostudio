-- =============================================================================
-- Lock access sync orchestration
-- - Slot assignments for member/guest PIN programming (Yale 99-slot model)
-- - Guest booking PIN lifecycle
-- - Sync job queue with retries
-- - Incident log for dashboard/email alerting
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lock_slot_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_number integer NOT NULL CHECK (slot_number BETWEEN 1 AND 99),
  slot_kind text NOT NULL CHECK (slot_kind IN ('member', 'guest')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (slot_kind = 'member' AND user_id IS NOT NULL AND booking_id IS NULL)
    OR
    (slot_kind = 'guest' AND booking_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS lock_slot_assignments_active_slot_unique_idx
  ON public.lock_slot_assignments (slot_number)
  WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS lock_slot_assignments_active_member_unique_idx
  ON public.lock_slot_assignments (user_id)
  WHERE active = true AND slot_kind = 'member';

CREATE UNIQUE INDEX IF NOT EXISTS lock_slot_assignments_active_guest_unique_idx
  ON public.lock_slot_assignments (booking_id)
  WHERE active = true AND slot_kind = 'guest';

CREATE INDEX IF NOT EXISTS lock_slot_assignments_kind_active_idx
  ON public.lock_slot_assignments (slot_kind, active, slot_number);

CREATE TABLE IF NOT EXISTS public.booking_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  code_type text NOT NULL CHECK (code_type IN ('guest')),
  pin_code text CHECK (pin_code IS NULL OR pin_code ~ '^[0-9]{6}$'),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'expired', 'revoked')),
  slot_assignment_id uuid REFERENCES public.lock_slot_assignments(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_access_codes_booking_type_unique_idx
  ON public.booking_access_codes (booking_id, code_type);

CREATE INDEX IF NOT EXISTS booking_access_codes_status_window_idx
  ON public.booking_access_codes (status, valid_from, valid_until);

CREATE TABLE IF NOT EXISTS public.lock_access_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type text NOT NULL,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('warning', 'error', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  title text NOT NULL,
  message text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lock_access_incidents_status_created_idx
  ON public.lock_access_incidents (status, created_at DESC);

CREATE INDEX IF NOT EXISTS lock_access_incidents_booking_created_idx
  ON public.lock_access_incidents (booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.lock_access_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_type text NOT NULL CHECK (
    job_type IN (
      'activate_member_window',
      'deactivate_member_window',
      'activate_guest_window',
      'deactivate_guest_window',
      'refresh_member_active'
    )
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead')),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 4,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  last_response jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lock_access_jobs_status_run_at_idx
  ON public.lock_access_jobs (status, run_at, id);

CREATE INDEX IF NOT EXISTS lock_access_jobs_booking_status_idx
  ON public.lock_access_jobs (booking_id, status, run_at);

CREATE INDEX IF NOT EXISTS lock_access_jobs_user_status_idx
  ON public.lock_access_jobs (user_id, status, run_at);

-- Keep dedupe narrow to pending queue only.
CREATE UNIQUE INDEX IF NOT EXISTS lock_access_jobs_pending_dedupe_idx
  ON public.lock_access_jobs (job_type, booking_id, user_id, run_at)
  WHERE status = 'pending';

ALTER TABLE public.lock_slot_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lock_access_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lock_access_jobs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.system_config (key, value)
VALUES
  ('LOCK_SYNC_ENABLED', 'false'::jsonb),
  ('LOCK_RETRY_SCHEDULE_SECONDS', '[0, 60, 300, 900]'::jsonb),
  ('LOCK_PROVIDER_TIMEOUT_MS', '8000'::jsonb),
  ('LOCK_MEMBER_SLOT_START', '1'::jsonb),
  ('LOCK_MEMBER_SLOT_END', '49'::jsonb),
  ('LOCK_GUEST_SLOT_START', '50'::jsonb),
  ('LOCK_GUEST_SLOT_END', '99'::jsonb)
ON CONFLICT (key) DO NOTHING;
