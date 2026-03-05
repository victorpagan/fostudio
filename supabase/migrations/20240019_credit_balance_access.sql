-- =============================================================================
-- Harden credit_balance access semantics
-- - Force security invoker so underlying credits_ledger RLS is applied.
-- - Restrict direct grants to authenticated/service_role only.
-- =============================================================================

DROP VIEW IF EXISTS public.credit_balance;

CREATE VIEW public.credit_balance
WITH (security_invoker = true) AS
  SELECT
    user_id,
    COALESCE(SUM(delta), 0)::numeric(10,2) AS balance
  FROM public.credits_ledger
  WHERE expires_at IS NULL OR expires_at > now()
  GROUP BY user_id;

REVOKE ALL ON public.credit_balance FROM PUBLIC;
REVOKE ALL ON public.credit_balance FROM anon;
REVOKE ALL ON public.credit_balance FROM authenticated;

GRANT SELECT ON public.credit_balance TO authenticated;
GRANT SELECT ON public.credit_balance TO service_role;
