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
import { resolveAvailableCreditBalance } from '~~/server/utils/credits/availableBalance'
import {
  buildRatePolicySnapshot,
  loadGuestBookingPolicy,
  loadStandbyBookingPolicy,
  validateGuestBookingWindow,
  validateStandbySelection
} from '~~/server/utils/booking/guestPolicy'
import type { BookingRateKind } from '~~/server/utils/booking/guestPolicy'
import { isMembershipCurrentlyActive } from '~~/server/utils/membership/status'
import { expireStalePendingGuestBookings } from '~~/server/utils/booking/pendingPayments'

const qSchema = z.object({
  start: z.string(),
  end: z.string(),
  mode: z.enum(['member', 'guest']).optional(),
  booking_kind: z.enum(['standard', 'workshop']).optional().default('standard'),
  rate_kind: z.enum(['standard', 'standby']).optional().default('standard')
})

const WORKSHOP_BOOKING_WINDOW_MONTHS = 3

function isThirtyMinuteAligned(dateTime: DateTime) {
  if (!dateTime.isValid) return false
  if (dateTime.second !== 0 || dateTime.millisecond !== 0) return false
  return dateTime.minute % 30 === 0
}

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

async function hasStandbyBookingToday(supabase: unknown, userId: string, start: DateTime) {
  type CountResult = { count?: number | null, error?: { message: string } | null }
  type CountQuery = PromiseLike<CountResult> & {
    eq: (column: string, value: unknown) => CountQuery
    gte: (column: string, value: unknown) => CountQuery
    in: (column: string, values: unknown[]) => CountQuery
    lt: (column: string, value: unknown) => CountQuery
    select: (columns?: string, options?: Record<string, unknown>) => CountQuery
  }
  const db = supabase as unknown as { from: (table: string) => CountQuery }
  const dayStart = start.setZone(STUDIO_TZ).startOf('day').toUTC().toISO()
  const dayEnd = start.setZone(STUDIO_TZ).startOf('day').plus({ days: 1 }).toUTC().toISO()
  if (!dayStart || !dayEnd) return false
  const { count, error } = await db
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('booking_rate_kind', 'standby')
    .in('status', ['confirmed', 'requested', 'pending_payment'])
    .gte('start_time', dayStart)
    .lt('start_time', dayEnd)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return Math.max(0, count ?? 0) > 0
}

export default defineEventHandler(async (event) => {
  const q = qSchema.parse(getQuery(event))
  const peakWindow = await loadPeakWindowConfig(event)
  const supabase = serverSupabaseServiceRole(event)
  await expireStalePendingGuestBookings(supabase)

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
    'workshop_credit_multiplier'
  ])
  const guestPolicy = await loadGuestBookingPolicy(event)
  const standbyPolicy = await loadStandbyBookingPolicy(event)

  let mode = q.mode ?? (user ? 'member' : 'guest')
  const bookingKind = q.booking_kind ?? 'standard'
  const rateKind = q.rate_kind ?? 'standard'
  let workshopMultiplier = 1

  let peakMultiplier: number = 1.5 // safe default; overwritten below
  let ratePerCreditCents: number | null = null
  let tierName: string | null = null
  let remainingCredits = 0
  let hasActiveMembership = false

  if (mode === 'member' && user) {
    const { data: membership, error: membershipError } = await supabase
      .from('memberships')
      .select('tier,status,current_period_end,canceled_at')
      .eq('user_id', user.sub)
      .maybeSingle()

    if (membershipError) {
      throw createError({ statusCode: 500, statusMessage: membershipError.message })
    }

    remainingCredits = await resolveAvailableCreditBalance(supabase, user.sub)

    hasActiveMembership = isMembershipCurrentlyActive(membership)
    const canBookFromCredits = remainingCredits > 0

    if (!membership || !hasActiveMembership) {
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

    if (!hasActiveMembership && canBookFromCredits) mode = 'guest'
  }

  if (mode === 'guest') {
    const guestValidation = validateGuestBookingWindow({ start, end, policy: guestPolicy })
    if (!guestValidation.ok) {
      throw createError({ statusCode: 400, statusMessage: guestValidation.message ?? 'Guest booking is not available for this time.' })
    }

    peakMultiplier = guestPolicy.peakMultiplier
    ratePerCreditCents = guestPolicy.ratePerCreditCents
    if (user?.sub) remainingCredits = await resolveAvailableCreditBalance(supabase, user.sub)
  }

  if (bookingKind === 'workshop') {
    if (!user) {
      throw createError({ statusCode: 401, statusMessage: 'Workshop bookings require an authenticated member account.' })
    }
    if (mode !== 'member') {
      throw createError({ statusCode: 403, statusMessage: 'Workshop bookings require member credit access.' })
    }

    const { data: customerRow, error: customerErr } = await supabase
      .from('customers')
      .select('workshop_booking_enabled')
      .eq('user_id', user.sub)
      .maybeSingle()
    if (customerErr) throw createError({ statusCode: 500, statusMessage: customerErr.message })
    if (!(customerRow as { workshop_booking_enabled?: boolean } | null)?.workshop_booking_enabled) {
      throw createError({ statusCode: 403, statusMessage: 'Workshop booking is not enabled for your account.' })
    }

    workshopMultiplier = Math.max(1, Number(cfg.workshop_credit_multiplier ?? 2))
    const maxWorkshopStart = DateTime.now().setZone(STUDIO_TZ).plus({ months: WORKSHOP_BOOKING_WINDOW_MONTHS })
    if (start > maxWorkshopStart) {
      throw createError({ statusCode: 400, statusMessage: 'Workshop bookings can only be made up to 3 months ahead.' })
    }
  }

  if (mode === 'member') {
    if (!isThirtyMinuteAligned(start) || !isThirtyMinuteAligned(end)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Member bookings must start and end on 30-minute increments.'
      })
    }
    if (durationHours < 0.5) {
      throw createError({ statusCode: 400, statusMessage: 'Minimum booking is 30 minutes.' })
    }
  }

  let standby = {
    eligible: false,
    reason: standbyPolicy.enabled ? 'Standby applies to same-day bookings of at least 4 hours.' : 'Standby booking is not enabled.',
    discountMultiplier: standbyPolicy.discountMultiplier,
    minOpenSlotHours: standbyPolicy.minOpenSlotHours
  }
  if (bookingKind === 'standard') {
    const standbyValidation = validateStandbySelection({
      start,
      end,
      accountKind: mode === 'guest' ? 'guest' : 'member',
      guestPolicy,
      standbyPolicy
    })
    let alreadyBooked = false
    if (user?.sub && standbyValidation.ok) {
      alreadyBooked = await hasStandbyBookingToday(supabase, user.sub, start)
    }
    standby = {
      eligible: Boolean(standbyValidation.ok && !alreadyBooked),
      reason: alreadyBooked ? 'Only one standby booking is allowed per day.' : (standbyValidation.message ?? 'Standby rate is available for this slot.'),
      discountMultiplier: standbyPolicy.discountMultiplier,
      minOpenSlotHours: standbyPolicy.minOpenSlotHours
    }
  }

  if (rateKind === 'standby') {
    if (!standby.eligible) {
      throw createError({ statusCode: 400, statusMessage: standby.reason })
    }
  }

  const baseCreditsNeeded = computeCredits(q.start, q.end, peakMultiplier!, peakWindow)
  const kindAdjustedCredits = bookingKind === 'workshop'
    ? Math.round(baseCreditsNeeded * workshopMultiplier * 100) / 100
    : baseCreditsNeeded
  const creditsNeeded = rateKind === 'standby'
    ? Math.round(kindAdjustedCredits * standbyPolicy.discountMultiplier * 100) / 100
    : kindAdjustedCredits
  const totalCents = ratePerCreditCents !== null ? Math.ceil(creditsNeeded * ratePerCreditCents) : null
  const shortfallCredits = mode === 'guest'
    ? Math.max(0, Math.round((creditsNeeded - remainingCredits) * 100) / 100)
    : 0
  const amountDueCents = mode === 'guest' && ratePerCreditCents !== null
    ? Math.ceil(shortfallCredits * ratePerCreditCents)
    : null

  return {
    start: start.toISO(),
    end: end.toISO(),
    durationHours,
    creditsNeeded,
    baseCreditsNeeded,
    bookingKind,
    rateKind,
    workshopMultiplier: bookingKind === 'workshop' ? workshopMultiplier : 1,
    peakMultiplier,
    mode,
    accountState: mode === 'guest' ? 'guest' : 'active_member',
    tierName,
    hasActiveMembership,
    remainingCredits,
    shortfallCredits,
    amountDueCents,
    canRequestHold: mode === 'member' && rateKind !== 'standby',
    // Guest pricing in dollars
    totalCents,
    totalDollars: totalCents !== null ? totalCents / 100 : null,
    ratePerCreditCents,
    guestPolicy: mode === 'guest'
      ? {
          bookingWindowDays: guestPolicy.bookingWindowDays,
          startHour: guestPolicy.startHour,
          endHour: guestPolicy.endHour,
          minBookingHours: guestPolicy.minBookingHours,
          bookingIncrementMinutes: guestPolicy.bookingIncrementMinutes,
          creditExpiryDays: guestPolicy.creditExpiryDays
        }
      : null,
    standby,
    ratePolicySnapshot: buildRatePolicySnapshot({
      accountKind: mode === 'guest' ? 'guest' : 'member',
      rateKind: rateKind as BookingRateKind,
      guestPolicy: mode === 'guest' ? guestPolicy : null,
      standbyPolicy: rateKind === 'standby' ? standbyPolicy : null
    }),
    // Breakdown info for display
    breakdown: {
      isPeakWindow: isPeakByConfig(start, peakWindow) || isPeakByConfig(end.minus({ minutes: 1 }), peakWindow),
      offPeakHours: durationHours // simplified — full breakdown could be computed
    }
  }
})
