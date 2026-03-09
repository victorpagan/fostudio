import { serverSupabaseClient } from '#supabase/server'
import { getTierCapMap } from '~~/server/utils/membership/capacity'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  // Pull all active + visible tiers so caps are DB-driven, not hardcoded
  const { data: tiers, error: tiersErr } = await supabase
    .from('membership_tiers')
    .select('id')
    .eq('active', true)
    .eq('visible', true)

  if (tiersErr) throw createError({ statusCode: 500, statusMessage: tiersErr.message })

  const availability: Record<string, {
    cap: number | null
    active: number
    spotsLeft: number | null
    isFull: boolean
  }> = {}

  const capMap = await getTierCapMap(supabase as any, (tiers ?? []).map(tier => tier.id))
  for (const tier of tiers ?? []) {
    const stats = capMap[tier.id]
    availability[tier.id] = {
      cap: stats?.cap ?? null,
      active: stats?.active ?? 0,
      spotsLeft: stats?.spotsLeft ?? null,
      isFull: stats?.isFull ?? false
    }
  }

  return { availability }
})
