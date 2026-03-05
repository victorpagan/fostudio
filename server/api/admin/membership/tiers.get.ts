import { requireServerAdmin } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any

  const { data, error } = await db
    .from('membership_tiers')
    .select(`
      id,
      display_name,
      description,
      booking_window_days,
      peak_multiplier,
      max_bank,
      max_slots,
      holds_included,
      active,
      visible,
      direct_access_only,
      sort_order,
      created_at,
      updated_at,
      membership_plan_variations:membership_plan_variations (
        tier_id,
        cadence,
        provider,
        provider_plan_id,
        provider_plan_variation_id,
        credits_per_month,
        price_cents,
        currency,
        discount_label,
        active,
        visible,
        sort_order,
        created_at,
        updated_at
      )
    `)
    .order('sort_order', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  type VariationRow = { sort_order?: number | null }
  type TierRow = { membership_plan_variations?: VariationRow[] } & Record<string, unknown>

  const tiers = ((data ?? []) as TierRow[]).map(tier => ({
    ...tier,
    membership_plan_variations: (tier.membership_plan_variations ?? []).sort(
      (left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0)
    )
  }))

  return { tiers }
})
