import { z } from 'zod'
import {serverSupabaseClient} from "#supabase/server";

const qSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
})

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const q = qSchema.parse(getQuery(event))

  const now = new Date()
  const from = q.from ? new Date(q.from) : now
  const to = q.to ? new Date(q.to) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id,start_time,end_time,status')
    .eq('status', 'confirmed')
    .lt('start_time', to.toISOString())
    .gt('end_time', from.toISOString())
    .order('start_time', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const { data: holds, error: holdsErr } = await supabase
    .from('booking_holds')
    .select('id,hold_start,hold_end')
    .lt('hold_start', to.toISOString())
    .gt('hold_end', from.toISOString())
    .order('hold_start', { ascending: true })

  if (holdsErr) throw createError({ statusCode: 500, statusMessage: holdsErr.message })

  const events = [
    ...(bookings ?? []).map((b) => ({
      id: `b_${b.id}`,
      start: b.start_time,
      end: b.end_time,
      display: 'background',
      title: 'Booked'
    })),
    ...(holds ?? []).map((h) => ({
      id: `h_${h.id}`,
      start: h.hold_start,
      end: h.hold_end,
      display: 'background',
      title: 'Hold'
    }))
  ]

  return { from: from.toISOString(), to: to.toISOString(), events }
})
