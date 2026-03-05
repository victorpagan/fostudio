import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  notes: z.string().max(500).optional().nullable()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  if (new Date(body.endTime).getTime() <= new Date(body.startTime).getTime()) {
    throw createError({ statusCode: 400, statusMessage: 'End time must be after start time' })
  }

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id,status')
    .eq('id', body.bookingId)
    .maybeSingle()

  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  if (['canceled', 'completed', 'declined', 'no_show'].includes(String(booking.status ?? '').toLowerCase())) {
    throw createError({ statusCode: 400, statusMessage: `Cannot reschedule booking in status "${booking.status}"` })
  }

  const { data: conflicts, error: conflictErr } = await supabase
    .from('bookings')
    .select('id')
    .neq('id', body.bookingId)
    .in('status', ['confirmed', 'requested', 'pending_payment'])
    .lt('start_time', body.endTime)
    .gt('end_time', body.startTime)
    .limit(1)

  if (conflictErr) throw createError({ statusCode: 500, statusMessage: conflictErr.message })
  if (conflicts && conflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Requested time conflicts with another booking' })
  }

  const { data: holdConflicts, error: holdErr } = await supabase
    .from('booking_holds')
    .select('id')
    .lt('hold_start', body.endTime)
    .gt('hold_end', body.startTime)
    .limit(1)

  if (holdErr) throw createError({ statusCode: 500, statusMessage: holdErr.message })
  if (holdConflicts && holdConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Requested time conflicts with an equipment hold' })
  }

  const { data: blockConflicts, error: blockErr } = await supabase
    .from('calendar_blocks')
    .select('id')
    .eq('active', true)
    .lt('start_time', body.endTime)
    .gt('end_time', body.startTime)
    .limit(1)

  if (blockErr) throw createError({ statusCode: 500, statusMessage: blockErr.message })
  if (blockConflicts && blockConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Requested time conflicts with a studio block' })
  }

  // Remove linked holds; admin can re-add hold by toggling from member booking flow if needed.
  const { error: removeHoldErr } = await supabase
    .from('booking_holds')
    .delete()
    .eq('booking_id', body.bookingId)

  if (removeHoldErr) throw createError({ statusCode: 500, statusMessage: removeHoldErr.message })

  const { data: updated, error: updateErr } = await supabase
    .from('bookings')
    .update({
      start_time: body.startTime,
      end_time: body.endTime,
      notes: body.notes ?? null
    })
    .eq('id', body.bookingId)
    .select('id,start_time,end_time,notes')
    .single()

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })
  return { booking: updated }
})
