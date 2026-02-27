// File: server/api/membership/catalog.get.ts
// Returns the membership tier catalog. Admins also receive hidden tiers
// (visible=false), such as the special 'test' tier for dry-run checkout.
import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  // Admins see all active tiers including hidden ones (e.g. the test tier).
  // Everyone else only sees active + visible tiers.
  const user = await serverSupabaseUser(event).catch(() => null)
  const role = (user as any)?.app_metadata?.role as string | undefined
  const isAdmin = role === 'admin' || role === 'service'

  console.log(`[catalog] user=${user?.sub}, role=${role}, isAdmin=${isAdmin}`)

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

  const tiers = (data ?? []).map((t: any) => ({
    ...t,
    // Mark test/hidden tiers so the UI can label them appropriately
    adminOnly: t.visible === false,
    membership_plan_variations: (t.membership_plan_variations ?? [])
      .filter((v: any) => v.provider === 'square' && v.active && (isAdmin || v.visible))
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }))

  console.log(`[catalog] returning ${tiers.length} tiers:`, tiers.map(t => ({ id: t.id, visible: t.visible, plans: t.membership_plan_variations.length })))
  return { tiers }
})
