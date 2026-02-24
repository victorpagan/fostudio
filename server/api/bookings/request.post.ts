import { z } from 'zod'
import { serverSupabaseUser, serverSupabaseClient } from "#supabase/server";

const schema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  notes: z.string().optional(),
  request_hold: z.boolean().optional().default(false)
})

function nextDay10am(end: Date) {
  const d = new Date(end)
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return d
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const supabase = await serverSupabaseClient(event)
  const body = schema.parse(await readBody(event))

  const start = new Date(body.start_time)
  const end = new Date(body.end_time)
  if (!(start < end)) throw createError({ statusCode: 400, statusMessage: 'Invalid time range' })

  // membership active check
  const { data: membership } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership || (membership.status || '').toLowerCase() !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Membership required' })
  }

  // fetch customer id for linkage
  const { data: cust } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  // insert booking request
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      user_id: user.id,
      customer_id: cust?.id ?? null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'requested',
      notes: body.notes ?? null
    })
    .select('*')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  // optional hold request (v1: just create hold record; later enforce caps/cost)
  if (body.request_hold) {
    const hs = end
    const he = nextDay10am(end)

    const { error: holdErr } = await supabase
      .from('booking_holds')
      .insert({
        booking_id: booking.id,
        hold_start: hs.toISOString(),
        hold_end: he.toISOString(),
        hold_type: 'overnight'
      })

    if (holdErr) {
      // booking is created, hold failed; return with warning
      return { ok: true, booking, holdCreated: false, holdError: holdErr.message }
    }
  }

  return { ok: true, booking, holdCreated: body.request_hold }
})
