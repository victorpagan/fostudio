import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { resolveHoldCycleWindow } from '~~/server/utils/booking/holds'

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function isSchemaMissingColumnError(message: string) {
  return /column .* does not exist/i.test(message) || /relation .* does not exist/i.test(message)
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const supabase = serverSupabaseServiceRole(event)
  const db = supabase as any

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('tier,status,current_period_start,current_period_end')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membership || (membership.status ?? '').toLowerCase() !== 'active') {
    return {
      holdsIncluded: 0,
      activeHoldCap: 0,
      activeHolds: 0,
      holdsUsedThisCycle: 0,
      cycleStartIso: null,
      cycleEndIso: null,
      paidHoldBalance: 0,
      includedHoldsRemaining: 0,
      activeHoldSlotsRemaining: 0,
      canRequestHoldNow: false
    }
  }

  const selectWithCap = 'holds_included,active_hold_cap'
  const selectLegacy = 'holds_included'
  let { data: tier, error: tierErr } = await db
    .from('membership_tiers')
    .select(selectWithCap)
    .eq('id', membership.tier)
    .maybeSingle()
  if (tierErr && isSchemaMissingColumnError(tierErr.message)) {
    const fallback = await db
      .from('membership_tiers')
      .select(selectLegacy)
      .eq('id', membership.tier)
      .maybeSingle()
    tier = fallback.data
    tierErr = fallback.error
  }

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })
  const holdsIncluded = Math.max(0, Math.floor(asNumber(tier?.holds_included)))
  const activeHoldCap = Math.max(0, Math.floor(asNumber((tier as Record<string, unknown> | null)?.active_hold_cap)))
  const holdCycle = resolveHoldCycleWindow({
    periodStartIso: membership.current_period_start ?? null,
    periodEndIso: membership.current_period_end ?? null
  })
  if (!holdCycle.startIso || !holdCycle.endIso) {
    throw createError({ statusCode: 500, statusMessage: 'Could not resolve hold cycle window' })
  }

  const nowIso = new Date().toISOString()
  const { data: activeHoldRows, error: activeHoldErr } = await supabase
    .from('booking_holds')
    .select('id, bookings!inner(user_id,status)')
    .eq('bookings.user_id', user.sub)
    .in('bookings.status', ['confirmed', 'requested', 'pending_payment'])
    .gt('hold_end', nowIso)

  if (activeHoldErr) throw createError({ statusCode: 500, statusMessage: activeHoldErr.message })
  const activeHolds = activeHoldRows?.length ?? 0

  const { count: usedHoldsCount, error: usedHoldsErr } = await supabase
    .from('booking_holds')
    .select('id, bookings!inner(user_id,status)', { count: 'exact', head: true })
    .eq('bookings.user_id', user.sub)
    .not('bookings.status', 'eq', 'canceled')
    .gte('hold_start', holdCycle.startIso)
    .lt('hold_start', holdCycle.endIso)

  if (usedHoldsErr) throw createError({ statusCode: 500, statusMessage: usedHoldsErr.message })
  const holdsUsedThisCycle = Math.max(0, usedHoldsCount ?? 0)

  const { data: holdBalanceRow, error: holdBalanceErr } = await supabase
    .from('hold_balance')
    .select('balance')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (holdBalanceErr) throw createError({ statusCode: 500, statusMessage: holdBalanceErr.message })
  const paidHoldBalance = Math.max(0, Math.floor(asNumber(holdBalanceRow?.balance)))
  const includedHoldsRemaining = Math.max(0, holdsIncluded - holdsUsedThisCycle)
  const activeHoldSlotsRemaining = Math.max(0, activeHoldCap - activeHolds)

  return {
    holdsIncluded,
    activeHoldCap,
    activeHolds,
    holdsUsedThisCycle,
    cycleStartIso: holdCycle.startIso,
    cycleEndIso: holdCycle.endIso,
    paidHoldBalance,
    includedHoldsRemaining,
    activeHoldSlotsRemaining,
    canRequestHoldNow: activeHoldCap > 0
      && activeHoldSlotsRemaining > 0
      && (includedHoldsRemaining > 0 || paidHoldBalance > 0)
  }
})
