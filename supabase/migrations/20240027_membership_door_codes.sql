-- =============================================================================
-- Membership door codes + member change requests
-- - Each customer can have one unique 6-digit door code
-- - Members can submit change requests (rate-limited in API)
-- =============================================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS door_code text,
  ADD COLUMN IF NOT EXISTS door_code_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_door_code_format_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_door_code_format_check
      CHECK (door_code IS NULL OR door_code ~ '^[0-9]{6}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_door_code_unique_idx
  ON public.customers (door_code)
  WHERE door_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.door_code_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_note text,
  resolution_note text
);

CREATE INDEX IF NOT EXISTS door_code_change_requests_user_requested_idx
  ON public.door_code_change_requests (user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS door_code_change_requests_status_idx
  ON public.door_code_change_requests (status, requested_at DESC);
