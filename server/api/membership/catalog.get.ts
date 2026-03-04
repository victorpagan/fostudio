// File: server/api/membership/catalog.get.ts
// Returns the membership tier catalog. Admins also receive hidden tiers
// (visible=false), such as the special 'test' tier for dry-run checkout.
import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import { resolveServerUserRole } from '~~/server/utils/auth'

type CatalogVariationRow = {
  cadence: string
  provider: string
  provider_plan_variation_id: string | null
  credits_per_month: number
  price_cents: number
  currency: string
  discount_label: string | null
  active: boolean
  visible: boolean
  sort_order: number | null
}

type CatalogTierRow = {
  id: string
  display_name: string
  description: string | null
  booking_window_days: number
  peak_multiplier: number
  max_bank: number
  holds_included: number
  active: boolean
  visible: boolean
  sort_order: number | null
  membership_plan_variations: CatalogVariationRow[] | null
}

export default defineEventHandler(async (event) => {
  // Admins see all active tiers including hidden ones (e.g. the test tier).
  // Everyone else only sees active + visible tiers.
  const user = await serverSupabaseUser(event).catch(() => null)
  const { isAdmin } = await resolveServerUserRole(event, user)
  const supabase = serverSupabaseServiceRole(event)

  let query = supabase
    .from('membership_tiers')
    .select(`
      id,
      display_name,
      description,
      booking_window_days,
      peak_multiplier,
      max_bank,
      holds_included,
      active,
      visible,
      sort_order,
      membership_plan_variations:membership_plan_variations (
        cadence,
        provider,
        provider_plan_variation_id,
        credits_per_month,
        price_cents,
        currency,
        discount_label,
        active,
        visible,
        sort_order
      )
    `)
    .eq('active', true)
    .order('sort_order', { ascending: true })

  // Non-admins only see public tiers
  if (!isAdmin) {
    query = query.eq('visible', true)
  }

  const { data, error } = await query

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const tiers = ((data ?? []) as CatalogTierRow[]).map(t => ({
    ...t,
    // Mark test/hidden tiers so the UI can label them appropriately
    adminOnly: t.visible === false,
    membership_plan_variations: (t.membership_plan_variations ?? [])
      .filter(v => v.provider === 'square' && v.active && (isAdmin || v.visible))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }))

  return { tiers }
})
