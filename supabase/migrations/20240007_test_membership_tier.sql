-- =============================================================================
-- Add admin-only 'test' membership tier
-- This tier is visible=false so it never shows to regular users.
-- It is used by admins to exercise the full checkout flow without charging
-- Square. The session.post.ts endpoint detects this tier and immediately
-- sets the membership to 'active' without creating a Square subscription.
-- =============================================================================

INSERT INTO public.membership_tiers (
  id,
  display_name,
  description,
  booking_window_days,
  peak_multiplier,
  max_bank,
  holds_included,
  active,
  visible,
  sort_order
) VALUES (
  'test',
  'Test (Admin Only)',
  'Admin-only tier for exercising the checkout flow end-to-end without a real Square charge.',
  30,
  1.0,
  999,
  true,
  true,    -- active = true so it can be checked out
  false,   -- visible = false so it's hidden from public catalog
  99       -- sort last
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  active       = EXCLUDED.active,
  visible      = EXCLUDED.visible;

-- Add plan variations for the test tier (price_cents=0, visible=false)
INSERT INTO public.membership_plan_variations (
  tier_id, cadence, provider,
  credits_per_month, price_cents, currency,
  discount_label, active, visible, sort_order
) VALUES
  ('test', 'monthly',   'square', 100, 0, 'USD', NULL, true, false, 1),
  ('test', 'quarterly', 'square', 100, 0, 'USD', NULL, true, false, 2),
  ('test', 'annual',    'square', 100, 0, 'USD', NULL, true, false, 3)
ON CONFLICT (tier_id, cadence, provider) DO UPDATE SET
  price_cents = EXCLUDED.price_cents,
  active      = EXCLUDED.active,
  visible     = EXCLUDED.visible;
