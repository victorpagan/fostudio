import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseServiceRole } from '#supabase/server'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getExternalCalendarEventsInRange } from '~~/server/utils/booking/externalCalendar'

const querySchema = z.object({
  status: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  includeExternal: z.coerce.boolean().optional().default(true),
  limit: z.coerce.number().int().min(1).max(300).optional().default(120)
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const query = querySchema.parse(getQuery(event))

  let builder = supabase
    .from('bookings')
    .select('id,user_id,customer_id,start_time,end_time,status,credits_burned,guest_name,guest_email,notes,created_at,updated_at,booking_holds(id,hold_start,hold_end,hold_type)')
    .order('start_time', { ascending: false })
    .limit(query.limit)

  if (query.status) builder = builder.eq('status', query.status)
  if (query.from) builder = builder.gte('start_time', query.from)
  if (query.to) builder = builder.lte('start_time', query.to)

  const { data: bookings, error: bookingsErr } = await builder
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

  const rows = (bookings ?? []).map((booking) => {
    const customer = booking.user_id ? customersByUserId.get(booking.user_id) : null
    const memberName = customer
      ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email
      : null

    return {
      ...booking,
      source_type: 'booking' as const,
      member_name: memberName,
      member_email: customer?.email ?? null,
      is_guest: !booking.user_id,
      external_provider: null as string | null,
      external_location: null as string | null,
      external_calendar_id: null as string | null
    }
  })

  let externalRows: Array<{
    id: string
    user_id: null
    customer_id: null
    start_time: string
    end_time: string
    status: string
    credits_burned: null
    guest_name: string | null
    guest_email: null
    notes: string | null
    created_at: string
    updated_at: string
    source_type: 'external'
    member_name: null
    member_email: null
    is_guest: false
    booking_holds: []
    external_provider: string | null
    external_location: string | null
    external_calendar_id: string | null
  }> = []

  const statusFilter = query.status?.trim().toLowerCase() ?? null
  const shouldIncludeExternal = query.includeExternal && (!statusFilter || statusFilter === 'external')

  if (shouldIncludeExternal) {
    const nowLa = DateTime.now().setZone('America/Los_Angeles')
    const defaultFrom = nowLa.minus({ days: 30 }).toUTC().toISO()
    const defaultTo = nowLa.plus({ days: 120 }).toUTC().toISO()
    const fromIso = query.from ?? defaultFrom
    const toIso = query.to ?? defaultTo

    if (fromIso && toIso) {
      try {
        const serviceRole = serverSupabaseServiceRole(event)
        const externalEvents = await getExternalCalendarEventsInRange(serviceRole, fromIso, toIso)

        externalRows = externalEvents.map(event => ({
          id: `external:${event.id}`,
          user_id: null,
          customer_id: null,
          start_time: event.start_time,
          end_time: event.end_time,
          status: 'external',
          credits_burned: null,
          guest_name: event.title || 'External booking',
          guest_email: null,
          notes: event.description ?? null,
          created_at: event.start_time,
          updated_at: event.end_time,
          source_type: 'external',
          member_name: null,
          member_email: null,
          is_guest: false,
          booking_holds: [],
          external_provider: event.provider ?? null,
          external_location: event.location ?? null,
          external_calendar_id: event.calendar_id ?? null
        }))
      } catch (error) {
        console.error('[admin/bookings] failed to load external calendar events', error)
      }
    }
  }

  const mergedRows = [...rows, ...externalRows]
    .sort((left, right) => {
      const leftTime = new Date(left.start_time).getTime()
      const rightTime = new Date(right.start_time).getTime()
      if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0
      if (!Number.isFinite(leftTime)) return 1
      if (!Number.isFinite(rightTime)) return -1
      return rightTime - leftTime
    })

  return { bookings: mergedRows }
})
