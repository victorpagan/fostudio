-- =============================================================================
-- Guest-first membership checkout sessions
-- - Allows guests to complete Square subscription checkout first
-- - Membership is claimed and linked to an auth account on /checkout/success
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.membership_checkout_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token                 text NOT NULL UNIQUE,
  tier                  text NOT NULL REFERENCES public.membership_tiers(id),
  cadence               text NOT NULL CHECK (cadence IN ('monthly', 'quarterly', 'annual')),
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'completed', 'claimed', 'failed', 'expired')),
  return_to             text,
  guest_email           text,
  payment_provider      text NOT NULL DEFAULT 'square',
  payment_link_id       text,
  order_template_id     text,
  plan_variation_id     text,
  square_customer_id    text,
  square_subscription_id text,
  paid_at               timestamptz,
  claimed_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  metadata              jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS membership_checkout_sessions_status_idx
  ON public.membership_checkout_sessions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS membership_checkout_sessions_claimed_user_idx
  ON public.membership_checkout_sessions(claimed_by_user_id)
  WHERE claimed_by_user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_membership_checkout_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_membership_checkout_sessions_updated_at
      BEFORE UPDATE ON public.membership_checkout_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.membership_checkout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "membership_checkout_sessions: own read" ON public.membership_checkout_sessions;
CREATE POLICY "membership_checkout_sessions: own read"
  ON public.membership_checkout_sessions FOR SELECT
  USING (claimed_by_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "membership_checkout_sessions: admin write" ON public.membership_checkout_sessions;
CREATE POLICY "membership_checkout_sessions: admin write"
  ON public.membership_checkout_sessions FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
