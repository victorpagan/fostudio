import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const querySchema = z.object({
  status: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
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
      member_name: memberName,
      member_email: customer?.email ?? null,
      is_guest: !booking.user_id
    }
  })

  return { bookings: rows }
})
