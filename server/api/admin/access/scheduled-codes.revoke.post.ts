import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { enqueueBookingAccessSync, processDueAccessJobs } from '~~/server/utils/access/jobs'

const bodySchema = z.object({
  id: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireServerAdmin(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))
  const nowIso = new Date().toISOString()

  const { data: link, error: linkError } = await db
    .from('booking_external_access')
    .select('id,booking_id')
    .eq('id', body.id)
    .maybeSingle()

  if (linkError) throw createError({ statusCode: 500, statusMessage: linkError.message })
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Scheduled access record not found.' })

  const { error: bookingError } = await db
    .from('bookings')
    .update({ status: 'canceled', updated_at: nowIso })
    .eq('id', link.booking_id)

  if (bookingError) throw createError({ statusCode: 500, statusMessage: bookingError.message })

  const { error: updateError } = await db
    .from('booking_external_access')
    .update({
      delivery_status: 'not_required',
      shared_at: null,
      shared_by: null,
      updated_by: user.sub,
      updated_at: nowIso
    })
    .eq('id', body.id)

  if (updateError) throw createError({ statusCode: 500, statusMessage: updateError.message })

  await enqueueBookingAccessSync(event, {
    bookingId: link.booking_id,
    reason: 'scheduled_external_booking_revoked'
  })
  const processorResult = await processDueAccessJobs(event, { limit: 20 })

  return {
    ok: true,
    bookingId: link.booking_id,
    processorResult
  }
})
