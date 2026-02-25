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
import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import { getServerConfigMap } from '~~/server/utils/config/secret'

const TZ = 'America/Los_Angeles'

const qSchema = z.object({
  start: z.string(),
  end: z.string(),
  mode: z.enum(['member', 'guest']).optional()
})

function isPeak(dt: DateTime) {
  const weekday = dt.weekday
  const hour = dt.hour + dt.minute / 60
  return weekday >= 1 && weekday <= 4 && hour >= 11 && hour < 16
}

function computeCredits(startIso: string, endIso: string, peakMultiplier: number) {
  const start = DateTime.fromISO(startIso, { zone: TZ })
  const end = DateTime.fromISO(endIso, { zone: TZ })
  if (!start.isValid || !end.isValid) throw new Error('Invalid datetime')
  if (!(start < end)) throw new Error('End must be after start')

  const stepMinutes = 15
  let cursor = start
  let credits = 0

  while (cursor < end) {
    const next = cursor.plus({ minutes: stepMinutes })
    const bucketEnd = next < end ? next : end
    const minutes = bucketEnd.diff(cursor, 'minutes').minutes
    const rate = isPeak(cursor) ? peakMultiplier : 1.0
    credits += (minutes / 60) * rate
    cursor = bucketEnd
  }

  return Math.round(credits * 100) / 100
}

export default defineEventHandler(async (event) => {
  const q = qSchema.parse(getQuery(event))

  const start = DateTime.fromISO(q.start, { zone: TZ })
  const end = DateTime.fromISO(q.end, { zone: TZ })

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
    const supabase = await serverSupabaseClient(event)

    const { data: membership } = await supabase
      .from('memberships')
      .select('tier, status')
      .eq('user_id', user.sub)
      .maybeSingle()

    if (!membership || membership.status !== 'active') {
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
  }

  if (mode === 'guest') {
    peakMultiplier = Number(cfg.guest_peak_multiplier ?? 2.0)
    ratePerCreditCents = Number(cfg.guest_booking_rate_per_credit_cents ?? 3500)
  }

  const creditsNeeded = computeCredits(q.start, q.end, peakMultiplier!)
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
      isPeakWindow: isPeak(start) || isPeak(end.minus({ minutes: 1 })),
      offPeakHours: durationHours, // simplified — full breakdown could be computed
    }
  }
})
