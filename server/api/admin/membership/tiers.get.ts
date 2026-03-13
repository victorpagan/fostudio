import { requireServerAdmin } from '~~/server/utils/auth'

function isSchemaMissingColumnError(message: string) {
  return /column .* does not exist/i.test(message) || /relation .* does not exist/i.test(message)
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any

  const selectWithExpiry = `
      id,
      display_name,
      description,
      booking_window_days,
      peak_multiplier,
      max_bank,
      credit_expiry_days,
      topoff_credit_expiry_days,
      max_slots,
      holds_included,
      active_hold_cap,
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
        sort_order
      )
    `

  const selectLegacy = `
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
        sort_order
      )
    `

  const runQuery = async (useLegacy = false) => {
    const query = db
      .from('membership_tiers')
      .select(useLegacy ? selectLegacy : selectWithExpiry)
      .order('sort_order', { ascending: true })

    return await query
  }

  let { data, error } = await runQuery(false)
  if (error && isSchemaMissingColumnError(error.message)) {
    const fallback = await runQuery(true)
    data = fallback.data
    error = fallback.error
  }

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  type VariationRow = { sort_order?: number | null }
  type TierRow = {
    credit_expiry_days?: number | null
    topoff_credit_expiry_days?: number | null
    active_hold_cap?: number | null
    membership_plan_variations?: VariationRow[]
  } & Record<string, unknown>

  const tiers = ((data ?? []) as TierRow[]).map(tier => ({
    ...tier,
    credit_expiry_days: Number(tier.credit_expiry_days ?? 90),
    topoff_credit_expiry_days: Number(tier.topoff_credit_expiry_days ?? 30),
    active_hold_cap: Number(tier.active_hold_cap ?? 0),
    membership_plan_variations: (tier.membership_plan_variations ?? []).sort(
      (left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0)
    )
  }))

  return { tiers }
})
