import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { loadPeakWindowConfig, toPeakWindowPayload } from '~~/server/utils/booking/peak'
import { getExternalCalendarEventsInRange } from '~~/server/utils/booking/externalCalendar'
import { resolveAvailableCreditBalance } from '~~/server/utils/credits/availableBalance'
import { getUpcomingWorkshopPromo } from '~~/server/utils/booking/workshopPromo'
import { isMembershipCurrentlyActive } from '~~/server/utils/membership/status'
import {
  computeStandbyOpenWindows,
  loadGuestBookingPolicy,
  loadStandbyBookingPolicy
} from '~~/server/utils/booking/guestPolicy'
import { isActivePendingPaymentReservation } from '~~/server/utils/booking/pendingPayments'

const qSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  booking_kind: z.enum(['standard', 'workshop']).optional().default('standard')
})

const WORKSHOP_BOOKING_WINDOW_DAYS = 92

function durationHours(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const hours = Math.max(0, (end - start) / 3600000)
  const rounded = Math.round(hours * 100) / 100
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function normalizeIso(value: string) {
  const parsed = DateTime.fromISO(value, { setZone: true })
  if (parsed.isValid) return parsed.toUTC().toISO()
  const sqlParsed = DateTime.fromSQL(value, { zone: 'utc' })
  if (sqlParsed.isValid) return sqlParsed.toUTC().toISO()
  return value
}

type HoldRow = {
  id: string
  hold_start: string
  hold_end: string
  bookings: { user_id: string | null } | Array<{ user_id: string | null }> | null
}

type CalendarBookingRow = {
  id: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  credits_burned: number | null
  user_id: string | null
  booking_rate_kind?: string | null
  payment_expires_at?: string | null
}

function isActiveCalendarBooking(row: CalendarBookingRow, nowMs = Date.now()) {
  if (String(row.status ?? '').toLowerCase() !== 'pending_payment') return true
  return isActivePendingPaymentReservation(row.payment_expires_at, nowMs)
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const supabase = await serverSupabaseClient(event)
  const serviceRole = serverSupabaseServiceRole(event)
  const q = qSchema.parse(getQuery(event))
  const [peakWindowConfig, guestPolicy, standbyPolicy] = await Promise.all([
    loadPeakWindowConfig(event),
    loadGuestBookingPolicy(event),
    loadStandbyBookingPolicy(event)
  ])

  // Fetch membership + balance in parallel so calendar reads are not serialized on account metadata.
  const [membershipResult, balanceResult] = await Promise.allSettled([
    supabase
      .from('memberships')
      .select('tier, status, current_period_end, canceled_at')
      .eq('user_id', user.sub)
      .maybeSingle(),
    resolveAvailableCreditBalance(supabase, user.sub)
  ])

  if (membershipResult.status === 'rejected') {
    throw createError({ statusCode: 500, statusMessage: membershipResult.reason?.message ?? 'Failed to load membership' })
  }
  if (membershipResult.value.error) {
    throw createError({ statusCode: 500, statusMessage: membershipResult.value.error.message })
  }
  if (balanceResult.status === 'rejected') {
    const message = balanceResult.reason instanceof Error ? balanceResult.reason.message : 'Failed to load credits'
    throw createError({ statusCode: 500, statusMessage: message })
  }

  const membership = membershipResult.value.data
  const remainingCredits = balanceResult.value

  const hasActiveMembership = isMembershipCurrentlyActive(membership)
  const accountKind = hasActiveMembership ? 'member' : 'guest'

  const { data: tierRow, error: tierErr } = await supabase
    .from('membership_tiers')
    .select('booking_window_days,peak_multiplier')
    .eq('id', membership?.tier ?? '')
    .maybeSingle()

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })
  const windowDays = q.booking_kind === 'workshop'
    ? WORKSHOP_BOOKING_WINDOW_DAYS
    : hasActiveMembership
      ? Number(tierRow?.booking_window_days ?? 30)
      : guestPolicy.bookingWindowDays

  // Use caller-supplied range if provided, clamped to the booking window
  const now = new Date()
  const maxTo = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000)

  const from = q.from ? new Date(q.from) : now
  // Respect caller's end but never exceed booking window
  const rawTo = q.to ? new Date(q.to) : maxTo
  const to = rawTo > maxTo ? maxTo : rawTo

  const [
    bookingsResult,
    holdsResult,
    blocksResult,
    externalEventsResult,
    workshopPromoResult
  ] = await Promise.allSettled([
    serviceRole
      .from('bookings')
      .select('id, start_time, end_time, status, notes, credits_burned, user_id, booking_rate_kind, payment_expires_at')
      .lt('start_time', to.toISOString())
      .gt('end_time', from.toISOString())
      .in('status', ['confirmed', 'requested', 'pending_payment'])
      .order('start_time', { ascending: true }),
    serviceRole
      .from('booking_holds')
      .select('id, hold_start, hold_end, bookings!inner(user_id)')
      .lt('hold_start', to.toISOString())
      .gt('hold_end', from.toISOString())
      .order('hold_start', { ascending: true }),
    serviceRole
      .from('calendar_blocks')
      .select('id,start_time,end_time,reason')
      .eq('active', true)
      .lt('start_time', to.toISOString())
      .gt('end_time', from.toISOString())
      .order('start_time', { ascending: true }),
    getExternalCalendarEventsInRange(
      serviceRole,
      from.toISOString(),
      to.toISOString()
    ),
    getUpcomingWorkshopPromo(serviceRole, from.toISOString())
  ])

  if (bookingsResult.status === 'rejected') {
    throw createError({ statusCode: 500, statusMessage: bookingsResult.reason?.message ?? 'Failed to load bookings' })
  }
  if (bookingsResult.value.error) {
    throw createError({ statusCode: 500, statusMessage: bookingsResult.value.error.message })
  }

  if (holdsResult.status === 'rejected') {
    throw createError({ statusCode: 500, statusMessage: holdsResult.reason?.message ?? 'Failed to load holds' })
  }
  if (holdsResult.value.error) {
    throw createError({ statusCode: 500, statusMessage: holdsResult.value.error.message })
  }

  if (blocksResult.status === 'rejected') {
    throw createError({ statusCode: 500, statusMessage: blocksResult.reason?.message ?? 'Failed to load calendar blocks' })
  }
  if (blocksResult.value.error) {
    throw createError({ statusCode: 500, statusMessage: blocksResult.value.error.message })
  }

  let externalEvents: Array<{
    id: string
    title: string | null
    description: string | null
    location: string | null
    start_time: string
    end_time: string
    provider: string
    calendar_id: string
  }> = []
  let workshopPromo: Awaited<ReturnType<typeof getUpcomingWorkshopPromo>> = null

  if (externalEventsResult.status === 'fulfilled') {
    externalEvents = externalEventsResult.value
  } else {
    console.error('[calendar/member] failed to load external calendar events', externalEventsResult.reason)
  }

  if (workshopPromoResult.status === 'fulfilled') {
    workshopPromo = workshopPromoResult.value
  } else {
    console.error('[calendar/member] failed to load workshop promo', workshopPromoResult.reason)
  }

  // Shape events for FullCalendar — distinguish own bookings from others
  const bookings = bookingsResult.value.data
  const holds = holdsResult.value.data
  const blocks = blocksResult.value.data

  const bookingRows = ((bookings ?? []) as unknown as CalendarBookingRow[]).filter(row =>
    isActiveCalendarBooking(row)
  )
  const holdRows = (holds ?? []) as HoldRow[]
  const events = [
    ...bookingRows.map((b) => {
      const isOwn = b.user_id === user.sub
      return {
        id: `b_${b.id}`,
        start: normalizeIso(b.start_time),
        end: normalizeIso(b.end_time),
        title: String(b.status ?? '').toLowerCase() === 'pending_payment'
          ? isOwn ? 'Pending payment' : `Temporarily reserved · ${durationHours(b.start_time, b.end_time)}h`
          : isOwn
            ? `Your booking${b.credits_burned ? ` (${b.credits_burned} cr)` : ''}`
            : `Member booked · ${durationHours(b.start_time, b.end_time)}h`,
        display: 'auto',
        color: String(b.status ?? '').toLowerCase() === 'pending_payment' ? '#6d28d9' : isOwn ? '#6366f1' : '#64748b',
        extendedProps: {
          type: 'booking',
          isOwn,
          bookingId: b.id,
          status: b.status,
          rateKind: (b as { booking_rate_kind?: string | null }).booking_rate_kind ?? 'standard',
          paymentExpiresAt: b.payment_expires_at ?? null,
          notes: isOwn ? b.notes : undefined
        }
      }
    }),
    ...holdRows.map((h) => {
      const bookingRel = h?.bookings
      const holdOwnerId = Array.isArray(bookingRel) ? bookingRel[0]?.user_id : bookingRel?.user_id
      return {
        id: `h_${h.id}`,
        start: normalizeIso(h.hold_start),
        end: normalizeIso(h.hold_end),
        title: 'Hold',
        display: 'auto',
        color: '#f59e0b',
        extendedProps: {
          type: 'hold',
          isOwn: holdOwnerId === user.sub
        }
      }
    }),
    ...(blocks ?? []).map(block => ({
      id: `x_${block.id}`,
      start: normalizeIso(block.start_time),
      end: normalizeIso(block.end_time),
      title: block.reason || 'Studio block',
      display: 'background',
      color: '#dc2626',
      extendedProps: { type: 'hold' }
    })),
    ...externalEvents.map(ext => ({
      id: `g_${ext.id}`,
      start: normalizeIso(ext.start_time),
      end: normalizeIso(ext.end_time),
      title: ext.title || 'External booking',
      display: 'auto',
      color: '#111827',
      extendedProps: {
        type: 'external',
        provider: ext.provider,
        location: ext.location
      }
    }))
  ]

  const busy = [
    ...bookingRows.map(row => ({ start: row.start_time, end: row.end_time })),
    ...(holdRows ?? []).map(row => ({ start: row.hold_start, end: row.hold_end })),
    ...(blocks ?? []).map(row => ({ start: row.start_time, end: row.end_time })),
    ...externalEvents.map(row => ({ start: row.start_time, end: row.end_time }))
  ]
  const standbyWindows = q.booking_kind === 'standard'
    ? computeStandbyOpenWindows({
        accountKind,
        guestPolicy,
        standbyPolicy,
        busy
      })
    : []
  const standbyEvents = standbyWindows.map((window, index) => ({
    id: `standby_${index}_${window.start}`,
    start: normalizeIso(window.start),
    end: normalizeIso(window.end),
    title: 'Standby availability',
    display: 'background',
    extendedProps: {
      type: 'standby',
      minOpenSlotHours: standbyPolicy.minOpenSlotHours
    }
  }))

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    bookingWindowDays: windowDays,
    canBook: true,
    hasActiveMembership,
    remainingCredits,
    guestBookingStartHour: accountKind === 'guest' ? guestPolicy.startHour : undefined,
    guestBookingEndHour: accountKind === 'guest' ? guestPolicy.endHour : undefined,
    guestMinBookingHours: accountKind === 'guest' ? guestPolicy.minBookingHours : undefined,
    guestBookingIncrementMinutes: accountKind === 'guest' ? guestPolicy.bookingIncrementMinutes : undefined,
    standbyWindows,
    peakWindow: toPeakWindowPayload(
      peakWindowConfig,
      hasActiveMembership ? Number(tierRow?.peak_multiplier ?? 1.5) : guestPolicy.peakMultiplier
    ),
    workshopPromo,
    events: [...events, ...standbyEvents]
  }
})
