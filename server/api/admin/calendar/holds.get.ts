import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const querySchema = z.object({
  activeOnly: z.coerce.boolean().optional().default(true),
  limit: z.coerce.number().int().min(1).max(300).optional().default(120)
})

type CustomerRow = {
  user_id: string | null
  email: string | null
  first_name: string | null
  last_name: string | null
}

type HoldBookingRow = {
  id: string
  user_id: string | null
  status: string | null
  start_time: string
  end_time: string
  notes: string | null
}

type HoldRow = {
  id: string
  booking_id: string
  hold_start: string
  hold_end: string
  hold_type: string
  created_at: string
  bookings: HoldBookingRow | null
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const query = querySchema.parse(getQuery(event))

  let builder = supabase
    .from('booking_holds')
    .select('id,booking_id,hold_start,hold_end,hold_type,created_at,bookings!inner(id,user_id,status,start_time,end_time,notes)')
    .order('hold_start', { ascending: true })
    .limit(query.limit)

  if (query.activeOnly) {
    builder = builder.gt('hold_end', new Date().toISOString())
  }

  const { data: holds, error: holdsErr } = await builder
  if (holdsErr) throw createError({ statusCode: 500, statusMessage: holdsErr.message })

  const typedHolds = (holds ?? []) as HoldRow[]

  const userIds = [...new Set(typedHolds
    .map(row => row?.bookings?.user_id)
    .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0))]

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

  const rows = typedHolds.map((row) => {
    const booking = row.bookings ?? null
    const customer = booking?.user_id ? customersByUserId.get(booking.user_id) : null
    const memberName = customer
      ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email
      : null

    return {
      id: row.id,
      booking_id: row.booking_id,
      hold_start: row.hold_start,
      hold_end: row.hold_end,
      hold_type: row.hold_type,
      created_at: row.created_at,
      booking: booking
        ? {
            id: booking.id,
            user_id: booking.user_id,
            status: booking.status,
            start_time: booking.start_time,
            end_time: booking.end_time,
            notes: booking.notes ?? null
          }
        : null,
      member_name: memberName,
      member_email: customer?.email ?? null
    }
  })

  return { holds: rows }
})
