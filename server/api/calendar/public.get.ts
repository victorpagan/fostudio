import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseServiceRole } from '#supabase/server'
import { loadPeakWindowConfig, toPeakWindowPayload } from '~~/server/utils/booking/peak'
import { getExternalCalendarEventsInRange } from '~~/server/utils/booking/externalCalendar'
import { getUpcomingWorkshopPromo } from '~~/server/utils/booking/workshopPromo'
import {
  computeStandbyOpenWindows,
  loadGuestBookingPolicy,
  loadStandbyBookingPolicy
} from '~~/server/utils/booking/guestPolicy'
import { isActivePendingPaymentReservation } from '~~/server/utils/booking/pendingPayments'

const qSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
})

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

type CalendarBookingRow = {
  id: string
  start_time: string
  end_time: string
  status: string
  payment_expires_at?: string | null
}

function isActiveCalendarBooking(row: CalendarBookingRow, nowMs = Date.now()) {
  if (String(row.status ?? '').toLowerCase() !== 'pending_payment') return true
  return isActivePendingPaymentReservation(row.payment_expires_at, nowMs)
}

export default defineEventHandler(async (event) => {
  const serviceRole = serverSupabaseServiceRole(event)
  const q = qSchema.parse(getQuery(event))
  const [peakWindowConfig, guestPolicy, standbyPolicy] = await Promise.all([
    loadPeakWindowConfig(event),
    loadGuestBookingPolicy(event),
    loadStandbyBookingPolicy(event)
  ])

  const now = new Date()
  const from = q.from ? new Date(q.from) : now
  const to = q.to ? new Date(q.to) : new Date(now.getTime() + guestPolicy.bookingWindowDays * 24 * 60 * 60 * 1000)

  const [
    bookingsResult,
    holdsResult,
    blocksResult,
    externalEventsResult,
    workshopPromoResult
  ] = await Promise.allSettled([
    serviceRole
      .from('bookings')
      .select('id, start_time, end_time, status, payment_expires_at')
      .in('status', ['confirmed', 'pending_payment'])
      .lt('start_time', to.toISOString())
      .gt('end_time', from.toISOString())
      .order('start_time', { ascending: true }),
    serviceRole
      .from('booking_holds')
      .select('id, hold_start, hold_end')
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
    console.error('[calendar/public] failed to load external calendar events', externalEventsResult.reason)
  }

  if (workshopPromoResult.status === 'fulfilled') {
    workshopPromo = workshopPromoResult.value
  } else {
    console.error('[calendar/public] failed to load workshop promo', workshopPromoResult.reason)
  }

  const bookings = bookingsResult.value.data
  const holds = holdsResult.value.data
  const blocks = blocksResult.value.data

  const bookingRows = ((bookings ?? []) as unknown as CalendarBookingRow[]).filter(row =>
    isActiveCalendarBooking(row, now.getTime())
  )

  const events = [
    ...bookingRows.map((b) => {
      const isPendingPayment = String(b.status ?? '').toLowerCase() === 'pending_payment'
      return {
        id: `b_${b.id}`,
        start: normalizeIso(b.start_time),
        end: normalizeIso(b.end_time),
        title: isPendingPayment
          ? `Temporarily reserved · ${durationHours(b.start_time, b.end_time)}h`
          : `Member booked · ${durationHours(b.start_time, b.end_time)}h`,
        display: 'auto',
        color: isPendingPayment ? '#6d28d9' : '#64748b',
        extendedProps: {
          type: 'booking',
          status: b.status,
          paymentExpiresAt: b.payment_expires_at ?? null
        }
      }
    }),
    ...(holds ?? []).map(h => ({
      id: `h_${h.id}`,
      start: normalizeIso(h.hold_start),
      end: normalizeIso(h.hold_end),
      title: 'Hold',
      display: 'auto',
      color: '#f59e0b',
      extendedProps: { type: 'hold' }
    })),
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
    ...(holds ?? []).map(row => ({ start: row.hold_start, end: row.hold_end })),
    ...(blocks ?? []).map(row => ({ start: row.start_time, end: row.end_time })),
    ...externalEvents.map(row => ({ start: row.start_time, end: row.end_time }))
  ]
  const standbyWindows = computeStandbyOpenWindows({
    accountKind: 'guest',
    guestPolicy,
    standbyPolicy,
    busy
  })
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
    bookingWindowDays: guestPolicy.bookingWindowDays,
    guestBookingStartHour: guestPolicy.startHour,
    guestBookingEndHour: guestPolicy.endHour,
    guestMinBookingHours: guestPolicy.minBookingHours,
    guestBookingIncrementMinutes: guestPolicy.bookingIncrementMinutes,
    standbyWindows,
    peakWindow: toPeakWindowPayload(peakWindowConfig, null),
    workshopPromo,
    events: [...events, ...standbyEvents]
  }
})
