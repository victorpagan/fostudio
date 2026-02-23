// File: server/api/membership/catalog.get.ts
import {serverSupabaseClient} from "#supabase/server";

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
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
    .eq('visible', true)
    .order('sort_order', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const tiers = (data ?? []).map((t: any) => ({
    ...t,
    membership_plan_variations: (t.membership_plan_variations ?? [])
      .filter((v: any) => v.provider === 'square' && v.active && v.visible)
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }))

  return { tiers }
})
