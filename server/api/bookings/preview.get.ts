/**
 * GET /api/bookings/preview
 *
 * Returns a credit cost estimate for a proposed booking window.
 * Works for both members (uses their tier multiplier) and guests (uses guest rate).
 * No auth required — guests use this to see cost before checkout.
 *
 * Query params:
 *   start  — ISO datetime
 *   end    — ISO datetime
 *   mode   — 'member' | 'guest' (default: 'guest' when unauthenticated)
 */
import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import { getServerConfigMap } from '~~/server/utils/config/secret'
import { isPeakByConfig, loadPeakWindowConfig, STUDIO_TZ } from '~~/server/utils/booking/peak'

const qSchema = z.object({
  start: z.string(),
  end: z.string(),
  mode: z.enum(['member', 'guest']).optional()
})

function computeCredits(startIso: string, endIso: string, peakMultiplier: number, peakWindow: Awaited<ReturnType<typeof loadPeakWindowConfig>>) {
  const start = DateTime.fromISO(startIso, { zone: STUDIO_TZ })
  const end = DateTime.fromISO(endIso, { zone: STUDIO_TZ })
  if (!start.isValid || !end.isValid) throw new Error('Invalid datetime')
  if (!(start < end)) throw new Error('End must be after start')

  const stepMinutes = 15
  let cursor = start
  let credits = 0

  while (cursor < end) {
    const next = cursor.plus({ minutes: stepMinutes })
    const bucketEnd = next < end ? next : end
    const minutes = bucketEnd.diff(cursor, 'minutes').minutes
    const rate = isPeakByConfig(cursor, peakWindow) ? peakMultiplier : 1.0
    credits += (minutes / 60) * rate
    cursor = bucketEnd
  }

  return Math.round(credits * 100) / 100
}

export default defineEventHandler(async (event) => {
  const q = qSchema.parse(getQuery(event))
  const peakWindow = await loadPeakWindowConfig(event)

  const start = DateTime.fromISO(q.start, { zone: STUDIO_TZ })
  const end = DateTime.fromISO(q.end, { zone: STUDIO_TZ })

  if (!start.isValid || !end.isValid) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })
  }
  if (!(start < end)) {
    throw createError({ statusCode: 400, statusMessage: 'End must be after start' })
  }

  const durationHours = end.diff(start, 'hours').hours

  // Try to identify the user and their tier for member pricing
  const user = await serverSupabaseUser(event)
  const cfg = await getServerConfigMap(event, [
    'guest_peak_multiplier',
    'guest_booking_rate_per_credit_cents'
  ])

  let mode = q.mode ?? (user ? 'member' : 'guest')

  let peakMultiplier: number = 1.5 // safe default; overwritten below
  let ratePerCreditCents: number | null = null
  let tierName: string | null = null

  if (mode === 'member' && user) {
    const supabase = serverSupabaseServiceRole(event)

    const { data: membership } = await supabase
      .from('memberships')
      .select('tier, status')
      .eq('user_id', user.sub)
      .maybeSingle()

    const { data: balanceRow } = await supabase
      .from('credit_balance')
      .select('balance')
      .eq('user_id', user.sub)
      .maybeSingle()
    const remainingCredits = Number(balanceRow?.balance ?? 0)

    const hasActiveMembership = (membership?.status ?? '').toLowerCase() === 'active'
    const canBookFromCredits = remainingCredits > 0

    if (!membership || (!hasActiveMembership && !canBookFromCredits)) {
      // Fall back to guest pricing if no active membership
      mode = 'guest'
    } else {
      const { data: tier } = await supabase
        .from('membership_tiers')
        .select('peak_multiplier, display_name')
        .eq('id', membership.tier)
        .maybeSingle()

      peakMultiplier = Number(tier?.peak_multiplier ?? 1.5)
      tierName = tier?.display_name ?? null
    }

    if (!hasActiveMembership && canBookFromCredits && !membership?.tier) {
      // Legacy credits-only account without a membership row/tier.
      peakMultiplier = 1.5
      tierName = 'Credits-only access'
      mode = 'member'
    }
  }

  if (mode === 'guest') {
    peakMultiplier = Number(cfg.guest_peak_multiplier ?? 2.0)
    ratePerCreditCents = Number(cfg.guest_booking_rate_per_credit_cents ?? 3500)
  }

  const creditsNeeded = computeCredits(q.start, q.end, peakMultiplier!, peakWindow)
  const totalCents = ratePerCreditCents !== null ? Math.ceil(creditsNeeded * ratePerCreditCents) : null

  return {
    start: start.toISO(),
    end: end.toISO(),
    durationHours,
    creditsNeeded,
    peakMultiplier,
    mode,
    tierName,
    // Guest pricing in dollars
    totalCents,
    totalDollars: totalCents !== null ? totalCents / 100 : null,
    ratePerCreditCents,
    // Breakdown info for display
    breakdown: {
      isPeakWindow: isPeakByConfig(start, peakWindow) || isPeakByConfig(end.minus({ minutes: 1 }), peakWindow),
      offPeakHours: durationHours // simplified — full breakdown could be computed
    }
  }
})
