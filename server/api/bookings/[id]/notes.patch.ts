import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { isAdminRole, readUserRole } from '~~/server/utils/auth'
import type { RoleCarrier } from '~~/server/utils/auth'

const bodySchema = z.object({
  notes: z.string().max(500).nullable().optional()
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const bookingId = getRouterParam(event, 'id')
  if (!bookingId) throw createError({ statusCode: 400, statusMessage: 'Missing booking id' })

  const body = bodySchema.parse(await readBody(event))
  const notes = (body.notes ?? '').trim()
  const role = readUserRole(user as RoleCarrier)
  const isAdmin = isAdminRole(role)
  const supabase = serverSupabaseServiceRole(event)

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id,user_id,status,start_time,notes')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })

  if (!isAdmin && booking.user_id !== user.sub) {
    throw createError({ statusCode: 403, statusMessage: 'Not your booking' })
  }

  const status = String(booking.status ?? '').toLowerCase()
  if (!['confirmed', 'requested', 'pending_payment'].includes(status)) {
    throw createError({ statusCode: 409, statusMessage: 'Only active bookings can be updated' })
  }

  const startMs = new Date(booking.start_time).getTime()
  if (Number.isFinite(startMs) && startMs <= Date.now()) {
    throw createError({ statusCode: 409, statusMessage: 'Past bookings cannot be updated' })
  }

  const { data: updated, error: updateErr } = await supabase
    .from('bookings')
    .update({
      notes: notes || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .select('id,notes,updated_at')
    .maybeSingle()

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  return {
    ok: true,
    bookingId,
    notes: updated?.notes ?? null,
    updatedAt: updated?.updated_at ?? null
  }
})
