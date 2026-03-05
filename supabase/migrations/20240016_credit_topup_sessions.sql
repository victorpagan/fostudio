-- =============================================================================
-- Credit top-up checkout sessions
-- - Tracks direct credit purchases from dashboard membership page
-- - Supports idempotent claim after Square redirect
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.credit_topup_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token              text NOT NULL UNIQUE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_id      uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  credits            numeric(8,2) NOT NULL CHECK (credits > 0),
  amount_cents       integer NOT NULL CHECK (amount_cents > 0),
  currency           text NOT NULL DEFAULT 'USD',
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'processed', 'failed', 'expired')),
  payment_provider   text NOT NULL DEFAULT 'square',
  payment_link_id    text,
  order_template_id  text,
  paid_at            timestamptz,
  ledger_entry_id    uuid REFERENCES public.credits_ledger(id) ON DELETE SET NULL,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_topup_sessions_user_idx
  ON public.credit_topup_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credit_topup_sessions_status_idx
  ON public.credit_topup_sessions(status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_credit_topup_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_credit_topup_sessions_updated_at
      BEFORE UPDATE ON public.credit_topup_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.credit_topup_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_topup_sessions: own read" ON public.credit_topup_sessions;
CREATE POLICY "credit_topup_sessions: own read"
  ON public.credit_topup_sessions FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "credit_topup_sessions: admin write" ON public.credit_topup_sessions;
CREATE POLICY "credit_topup_sessions: admin write"
  ON public.credit_topup_sessions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
