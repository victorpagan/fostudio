-- Durable one-week staff setup links.
-- The emailed dashboard link points at this table-backed token, then the dashboard
-- generates a fresh short-lived Supabase recovery link when the invite is opened.

CREATE TABLE IF NOT EXISTS public.staff_setup_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  normalized_email text NOT NULL,
  link_type text NOT NULL DEFAULT 'recovery' CHECK (link_type IN ('invite', 'recovery')),
  redirect_to text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_count integer NOT NULL DEFAULT 0,
  last_resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_setup_tokens_auth_user_idx
  ON public.staff_setup_tokens (auth_user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS staff_setup_tokens_email_idx
  ON public.staff_setup_tokens (normalized_email, expires_at DESC);

CREATE INDEX IF NOT EXISTS staff_setup_tokens_active_idx
  ON public.staff_setup_tokens (expires_at DESC)
  WHERE used_at IS NULL AND revoked_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_staff_setup_tokens_updated_at'
  ) THEN
    CREATE TRIGGER trg_staff_setup_tokens_updated_at
      BEFORE UPDATE ON public.staff_setup_tokens
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.staff_setup_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_setup_tokens_service_all" ON public.staff_setup_tokens;
CREATE POLICY "staff_setup_tokens_service_all"
  ON public.staff_setup_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
