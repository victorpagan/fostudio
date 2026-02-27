// File: server/api/debug/tiers.get.ts
// Debug endpoint to check what tiers are in the database
import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  const { data: tiers, error } = await supabase
    .from('membership_tiers')
    .select('id, display_name, active, visible, sort_order')
    .order('sort_order', { ascending: true })

  if (error) {
    return { error: error.message }
  }

  const { data: variations, error: varError } = await supabase
    .from('membership_plan_variations')
    .select('tier_id, cadence, active, visible, price_cents, provider_plan_variation_id')
    .order('tier_id', { ascending: true })

  if (varError) {
    return { error: varError.message }
  }

  return {
    tiers: tiers ?? [],
    variations: variations ?? [],
    summary: {
      tierCount: tiers?.length ?? 0,
      variationCount: variations?.length ?? 0,
      hasTestTier: !!(tiers ?? []).find((t: any) => t.id === 'test')
    }
  }
})
