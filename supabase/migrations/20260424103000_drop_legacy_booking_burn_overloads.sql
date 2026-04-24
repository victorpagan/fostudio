-- Remove legacy booking burn RPC overloads that became ambiguous after workshop
-- booking arguments were added. The remaining function signature is the
-- workshop-aware version created in 20260423103000_referrals_and_workshops.sql.
DROP FUNCTION IF EXISTS public.create_confirmed_booking_with_burn(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text,
  boolean,
  numeric,
  boolean,
  numeric
);

DROP FUNCTION IF EXISTS public.create_confirmed_booking_with_burn(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text,
  boolean,
  numeric,
  boolean
);

DROP FUNCTION IF EXISTS public.create_confirmed_booking_with_burn_no_membership(
  uuid,
  uuid,
  timestamptz,
  timestamptz,
  text,
  numeric
);
