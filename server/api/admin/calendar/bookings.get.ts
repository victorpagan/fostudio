import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseServiceRole } from '#supabase/server'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getExternalCalendarEventsInRange } from '~~/server/utils/booking/externalCalendar'
import { maybeAutoSyncGoogleCalendar } from '~~/server/utils/integrations/googleCalendar'

const qSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
})

function normalizeIso(value: string) {
  const parsed = DateTime.fromISO(value, { setZone: true })
  if (parsed.isValid) return parsed.toUTC().toISO()
  const sqlParsed = DateTime.fromSQL(value, { zone: 'utc' })
  if (sqlParsed.isValid) return sqlParsed.toUTC().toISO()
  return value
}

function durationHours(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const hours = Math.max(0, (end - start) / 3600000)
  const rounded = Math.round(hours * 100) / 100
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function parseQueryDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback
  const dt = DateTime.fromISO(value, { setZone: true })
  if (dt.isValid) return dt.toUTC().toJSDate()
  const asDate = new Date(value)
  if (Number.isFinite(asDate.getTime())) return asDate
  return fallback
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const q = qSchema.parse(getQuery(event))

  const now = new Date()
  const from = parseQueryDate(q.from, new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const to = parseQueryDate(q.to, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))

  try {
    await maybeAutoSyncGoogleCalendar(event, 'calendar_admin')
  } catch (error) {
    console.error('[admin/calendar/bookings] google sync failed', error)
  }

  const { data: bookings, error: bookingsErr } = await supabase
    .from('bookings')
    .select('id,user_id,guest_name,guest_email,start_time,end_time,status,credits_burned,notes')
    .in('status', ['confirmed', 'requested', 'pending_payment'])
    .lt('start_time', to.toISOString())
    .gt('end_time', from.toISOString())
    .order('start_time', { ascending: true })

  if (bookingsErr) throw createError({ statusCode: 500, statusMessage: bookingsErr.message })

  const userIds = [...new Set((bookings ?? [])
    .map(row => row.user_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0))]

  type CustomerRow = {
    user_id: string | null
    email: string | null
    first_name: string | null
    last_name: string | null
  }

  const emptyCustomers: CustomerRow[] = []

  const { data: customers, error: customersErr } = userIds.length
    ? await supabase
        .from('customers')
        .select('user_id,email,first_name,last_name')
        .in('user_id', userIds)
    : { data: emptyCustomers, error: null }

  if (customersErr) throw createError({ statusCode: 500, statusMessage: customersErr.message })

  const customersByUserId = new Map<string, CustomerRow>()
  for (const customer of customers ?? []) {
    if (customer.user_id) customersByUserId.set(customer.user_id, customer)
  }

  const { data: holds, error: holdsErr } = await supabase
    .from('booking_holds')
    .select('id, hold_start, hold_end')
    .lt('hold_start', to.toISOString())
    .gt('hold_end', from.toISOString())
    .order('hold_start', { ascending: true })

  if (holdsErr) throw createError({ statusCode: 500, statusMessage: holdsErr.message })

  const { data: blocks, error: blocksErr } = await supabase
    .from('calendar_blocks')
    .select('id,start_time,end_time,reason')
    .eq('active', true)
    .lt('start_time', to.toISOString())
    .gt('end_time', from.toISOString())
    .order('start_time', { ascending: true })

  if (blocksErr) throw createError({ statusCode: 500, statusMessage: blocksErr.message })

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

  try {
    const serviceRole = serverSupabaseServiceRole(event)
    externalEvents = await getExternalCalendarEventsInRange(
      serviceRole,
      from.toISOString(),
      to.toISOString()
    )
  } catch (error) {
    console.error('[admin/calendar/bookings] failed to load external calendar events', error)
  }

  const events = [
    ...(bookings ?? []).map((booking) => {
      const customer = booking.user_id ? customersByUserId.get(booking.user_id) : null
      const memberName = customer
        ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email
        : null
      const partyLabel = booking.user_id
        ? (memberName || customer?.email || booking.user_id || 'Member booking')
        : (booking.guest_name || booking.guest_email || 'Guest booking')
      const creditLabel = booking.credits_burned ? ` · ${booking.credits_burned} cr` : ''

      return {
        id: `b_${booking.id}`,
        start: normalizeIso(booking.start_time),
        end: normalizeIso(booking.end_time),
        title: `${partyLabel}${creditLabel}`,
        display: 'auto',
        color: '#4f6d8f',
        extendedProps: {
          type: 'booking',
          bookingId: booking.id,
          status: booking.status,
          notes: booking.notes ?? null,
          isGuest: !booking.user_id
        }
      }
    }),
    ...(holds ?? []).map(hold => ({
      id: `h_${hold.id}`,
      start: normalizeIso(hold.hold_start),
      end: normalizeIso(hold.hold_end),
      title: 'Hold',
      display: 'auto',
      color: '#f59e0b',
      extendedProps: { type: 'hold' }
    })),
    ...(blocks ?? []).map(block => ({
      id: `x_${block.id}`,
      start: normalizeIso(block.start_time),
      end: normalizeIso(block.end_time),
      title: block.reason || 'Studio blocked off',
      display: 'auto',
      color: '#111111',
      extendedProps: {
        type: 'block',
        blockId: block.id,
        notes: block.reason ?? null
      }
    })),
    ...externalEvents.map(ext => ({
      id: `g_${ext.id}`,
      start: normalizeIso(ext.start_time),
      end: normalizeIso(ext.end_time),
      title: ext.title || `External booking · ${durationHours(ext.start_time, ext.end_time)}h`,
      display: 'auto',
      color: '#0d9488',
      extendedProps: {
        type: 'external',
        notes: ext.description,
        provider: ext.provider,
        location: ext.location,
        calendarId: ext.calendar_id
      }
    }))
  ]

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    events
  }
})
