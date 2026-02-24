import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  // Pull all active + visible tiers so caps are DB-driven, not hardcoded
  const { data: tiers, error: tiersErr } = await supabase
    .from('membership_tiers')
    .select('id, max_slots')
    .eq('active', true)
    .eq('visible', true)

  if (tiersErr) throw createError({ statusCode: 500, statusMessage: tiersErr.message })

  // Count active memberships grouped by tier
  const { data: counts, error: countsErr } = await supabase
    .from('memberships')
    .select('tier')
    .eq('status', 'active')

  if (countsErr) throw createError({ statusCode: 500, statusMessage: countsErr.message })

  // Build counts map
  const activeByTier: Record<string, number> = {}
  for (const row of counts ?? []) {
    if (row.tier) {
      activeByTier[row.tier] = (activeByTier[row.tier] ?? 0) + 1
    }
  }

  const availability: Record<string, {
    cap: number | null
    active: number
    spotsLeft: number | null
    isFull: boolean
  }> = {}

  for (const tier of tiers ?? []) {
    const cap = tier.max_slots ?? null // null = unlimited
    const active = activeByTier[tier.id] ?? 0
    const spotsLeft = cap !== null ? Math.max(cap - active, 0) : null
    availability[tier.id] = {
      cap,
      active,
      spotsLeft,
      isFull: cap !== null ? active >= cap : false
    }
  }

  return { availability }
})
