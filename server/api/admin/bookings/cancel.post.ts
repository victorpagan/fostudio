import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'
import { maybeForceSyncGoogleCalendar } from '~~/server/utils/integrations/googleCalendar'

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  refundCredits: z.boolean().default(true)
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id,user_id,status,credits_burned')
    .eq('id', body.bookingId)
    .maybeSingle()

  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  if (booking.status === 'canceled') {
    return { ok: true, alreadyCanceled: true, refundedCredits: 0 }
  }

  if (!['confirmed', 'requested'].includes((booking.status ?? '').toLowerCase())) {
    throw createError({ statusCode: 400, statusMessage: `Booking cannot be canceled from status "${booking.status}"` })
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({ status: 'canceled' })
    .eq('id', booking.id)

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  const { error: holdsErr } = await supabase
    .from('booking_holds')
    .delete()
    .eq('booking_id', booking.id)

  if (holdsErr) throw createError({ statusCode: 500, statusMessage: holdsErr.message })

  let refundedCredits = 0
  if (body.refundCredits && booking.user_id && Number(booking.credits_burned ?? 0) > 0) {
    const refundAmount = Number(booking.credits_burned ?? 0)

    const { data: existingRefund } = await supabase
      .from('credits_ledger')
      .select('id')
      .eq('user_id', booking.user_id)
      .eq('reason', 'refund')
      .eq('external_ref', booking.id)
      .maybeSingle()

    if (!existingRefund) {
      const { error: refundErr } = await supabase
        .from('credits_ledger')
        .insert({
          user_id: booking.user_id,
          delta: refundAmount,
          reason: 'refund',
          external_ref: booking.id,
          metadata: { source: 'admin_cancel' }
        })

      if (refundErr) throw createError({ statusCode: 500, statusMessage: refundErr.message })
      refundedCredits = refundAmount
    }
  }

  await enqueueBookingAccessSync(event, {
    bookingId: booking.id,
    reason: 'admin_booking_cancel'
  }).catch((error) => {
    console.warn('[access/sync] failed to queue admin booking cancel sync', {
      bookingId: booking.id,
      error: (error as Error)?.message ?? String(error)
    })
  })

  await maybeForceSyncGoogleCalendar(event, 'admin_booking_cancel').catch((error) => {
    console.warn('[gcal-sync] failed to force sync after admin booking cancel', {
      bookingId: booking.id,
      error: (error as Error)?.message ?? String(error)
    })
  })

  return {
    ok: true,
    bookingId: booking.id,
    refundedCredits
  }
})
