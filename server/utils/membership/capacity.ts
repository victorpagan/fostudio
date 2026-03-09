type MembershipStatus = 'active' | 'past_due'

const OCCUPIED_STATUSES: MembershipStatus[] = ['active', 'past_due']

export type TierCapacity = {
  tierId: string
  cap: number | null
  active: number
  spotsLeft: number | null
  isFull: boolean
}

export async function getTierCapMap(
  supabase: any,
  tierIds: string[]
): Promise<Record<string, TierCapacity>> {
  const uniqueTierIds = Array.from(new Set(tierIds.filter(Boolean)))
  if (!uniqueTierIds.length) return {}

  const { data: tierRows, error: tiersErr } = await supabase
    .from('membership_tiers')
    .select('id,max_slots')
    .in('id', uniqueTierIds)

  if (tiersErr) {
    throw createError({ statusCode: 500, statusMessage: tiersErr.message })
  }

  const { data: memberships, error: membershipsErr } = await supabase
    .from('memberships')
    .select('tier,status')
    .in('tier', uniqueTierIds)
    .in('status', OCCUPIED_STATUSES)

  if (membershipsErr) {
    throw createError({ statusCode: 500, statusMessage: membershipsErr.message })
  }

  const activeByTier: Record<string, number> = {}
  for (const row of memberships ?? []) {
    const tierId = typeof row.tier === 'string' ? row.tier : null
    if (!tierId) continue
    activeByTier[tierId] = (activeByTier[tierId] ?? 0) + 1
  }

  const result: Record<string, TierCapacity> = {}
  for (const tier of tierRows ?? []) {
    const tierId = String(tier.id)
    const cap = tier.max_slots === null || typeof tier.max_slots === 'undefined'
      ? null
      : Number(tier.max_slots)
    const active = activeByTier[tierId] ?? 0
    const spotsLeft = cap === null ? null : Math.max(cap - active, 0)
    result[tierId] = {
      tierId,
      cap,
      active,
      spotsLeft,
      isFull: cap !== null ? active >= cap : false
    }
  }

  for (const tierId of uniqueTierIds) {
    if (result[tierId]) continue
    result[tierId] = {
      tierId,
      cap: null,
      active: 0,
      spotsLeft: null,
      isFull: false
    }
  }

  return result
}

export async function getSingleTierCapacity(supabase: any, tierId: string): Promise<TierCapacity> {
  const map = await getTierCapMap(supabase, [tierId])
  return map[tierId] ?? {
    tierId,
    cap: null,
    active: 0,
    spotsLeft: null,
    isFull: false
  }
}

export async function isPriorityMemberForWaitlist(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const status = String(data?.status ?? '').toLowerCase()
  return status === 'active' || status === 'past_due'
}
