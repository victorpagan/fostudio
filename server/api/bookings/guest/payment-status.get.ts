import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { expireStalePendingGuestBookings } from '~~/server/utils/booking/pendingPayments'
import { findGuestPaymentSession, inspectGuestPaymentCheckout } from '~~/server/utils/booking/guestPaymentCheckout'

const querySchema = z.object({
  bookingId: z.string().uuid().optional()
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const query = querySchema.parse(getQuery(event))
  const supabase = serverSupabaseServiceRole(event)
  await expireStalePendingGuestBookings(event, supabase, undefined, {
    bookingId: query.bookingId,
    userId: user.sub,
    limit: query.bookingId ? 1 : 10
  })

  let bookingQuery = supabase
    .from('bookings')
    .select('id,user_id,status,start_time,end_time,payment_expires_at,created_at')
    .eq('user_id', user.sub)

  if (query.bookingId) bookingQuery = bookingQuery.eq('id', query.bookingId)
  else bookingQuery = bookingQuery.eq('status', 'pending_payment')

  const { data: booking, error: bookingError } = await bookingQuery
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (bookingError) throw createError({ statusCode: 500, statusMessage: bookingError.message })
  if (!booking) return { pending: null }

  if (String(booking.status ?? '').toLowerCase() !== 'pending_payment') {
    return { pending: null, bookingStatus: booking.status }
  }

  const session = await findGuestPaymentSession(supabase, booking.id, user.sub)
  if (!session) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This reservation has no active checkout. Release it and choose the time again.'
    })
  }

  const inspection = await inspectGuestPaymentCheckout(event, session)
  const expiresAtMs = booking.payment_expires_at ? Date.parse(booking.payment_expires_at) : Number.NaN
  const secondsRemaining = Number.isFinite(expiresAtMs)
    ? Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000))
    : 0

  return {
    pending: {
      bookingId: booking.id,
      startTime: booking.start_time,
      endTime: booking.end_time,
      paymentExpiresAt: booking.payment_expires_at,
      secondsRemaining,
      amountDueCents: Math.max(0, Number(session.amount_cents ?? 0)),
      credits: Math.max(0, Number(session.credits ?? 0)),
      checkoutUrl: inspection.completed ? null : inspection.checkoutUrl,
      checkoutAvailable: !inspection.completed && inspection.linkAvailable && secondsRemaining > 0,
      paymentCompleted: inspection.completed,
      paymentStatus: inspection.paymentStatus,
      failureCode: inspection.failureCode,
      issueMessage: inspection.issueMessage,
      message: inspection.completed
        ? 'Payment completed and the booking is being confirmed. Refresh in a moment.'
        : inspection.issueMessage
          ?? 'Checkout has not been completed. Resume payment before the reservation expires.'
    }
  }
})
