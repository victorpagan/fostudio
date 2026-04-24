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
  mode: z.enum(['member', 'guest']).optional(),
  booking_kind: z.enum(['standard', 'workshop']).optional().default('standard')
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

function toValidHour(raw: unknown, fallback: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  const hour = Math.floor(parsed)
  return Math.min(24, Math.max(0, hour))
}

function toHourValue(dateTime: DateTime) {
  return dateTime.hour + (dateTime.minute / 60) + (dateTime.second / 3600)
}

function formatHourLabel(hour: number) {
  const normalized = Math.min(24, Math.max(0, Math.floor(hour)))
  if (normalized === 24) return '12:00 AM'
  return DateTime.fromObject({ year: 2026, month: 1, day: 1, hour: normalized, minute: 0 }, { zone: STUDIO_TZ }).toFormat('h:mm a')
}

export default defineEventHandler(async (event) => {
  const q = qSchema.parse(getQuery(event))
  const peakWindow = await loadPeakWindowConfig(event)
  const supabase = serverSupabaseServiceRole(event)

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
    'guest_booking_rate_per_credit_cents',
    'guest_booking_window_days',
    'guest_booking_start_hour',
    'guest_booking_end_hour',
    'workshop_credit_multiplier'
  ])

  let mode = q.mode ?? (user ? 'member' : 'guest')
  const bookingKind = q.booking_kind ?? 'standard'
  let workshopMultiplier = 1

  let peakMultiplier: number = 1.5 // safe default; overwritten below
  let ratePerCreditCents: number | null = null
  let tierName: string | null = null

  if (mode === 'member' && user) {
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
    const guestWindowDays = Math.max(1, Number(cfg.guest_booking_window_days ?? 7))
    const guestStartHour = toValidHour(cfg.guest_booking_start_hour, 11)
    let guestEndHour = toValidHour(cfg.guest_booking_end_hour, 19)
    if (guestEndHour <= guestStartHour) {
      guestEndHour = Math.min(24, guestStartHour + 1)
    }

    const now = DateTime.now().setZone(STUDIO_TZ)
    if (start < now) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot book in the past' })
    }
    const maxAhead = now.plus({ days: guestWindowDays })
    if (start > maxAhead) {
      throw createError({ statusCode: 400, statusMessage: `Guest bookings can only be made up to ${guestWindowDays} days ahead` })
    }

    const sameDay = start.hasSame(end, 'day')
    const startHourValue = toHourValue(start)
    const endHourValue = toHourValue(end)
    if (!sameDay || startHourValue < guestStartHour || endHourValue > guestEndHour) {
      throw createError({
        statusCode: 400,
        statusMessage: `Guest bookings must start/end between ${formatHourLabel(guestStartHour)} and ${formatHourLabel(guestEndHour)} (Los Angeles time).`
      })
    }

    peakMultiplier = Number(cfg.guest_peak_multiplier ?? 2.0)
    ratePerCreditCents = Number(cfg.guest_booking_rate_per_credit_cents ?? 3500)
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

  const baseCreditsNeeded = computeCredits(q.start, q.end, peakMultiplier!, peakWindow)
  const creditsNeeded = bookingKind === 'workshop'
    ? Math.round(baseCreditsNeeded * workshopMultiplier * 100) / 100
    : baseCreditsNeeded
  const totalCents = ratePerCreditCents !== null ? Math.ceil(creditsNeeded * ratePerCreditCents) : null

  return {
    start: start.toISO(),
    end: end.toISO(),
    durationHours,
    creditsNeeded,
    bookingKind,
    workshopMultiplier: bookingKind === 'workshop' ? workshopMultiplier : 1,
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
