-- =============================================================================
-- Permanent lock codes (admin-managed, non-booking-window)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lock_permanent_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  slot_number integer NOT NULL CHECK (slot_number BETWEEN 1 AND 99),
  code text NOT NULL CHECK (code ~ '^[0-9]{6}$'),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  last_sync_status text CHECK (last_sync_status IN ('ok', 'error')),
  last_sync_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lock_permanent_codes_active_slot_unique_idx
  ON public.lock_permanent_codes (slot_number)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS lock_permanent_codes_active_idx
  ON public.lock_permanent_codes (active, slot_number);

ALTER TABLE public.lock_permanent_codes ENABLE ROW LEVEL SECURITY;
