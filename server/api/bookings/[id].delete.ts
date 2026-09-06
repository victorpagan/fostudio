/**
 * DELETE /api/bookings/:id
 *
 * Cancels a booking.
 *
 * Rules:
 *  - Must be authenticated
 *  - Must own the booking (or be admin)
 *  - Booking must be 'confirmed' or 'requested' (not already canceled/completed)
 *  - Past/started bookings cannot be canceled
 *  - Member cancellations are allowed only when start_time is >= 24h from now
 *  - Eligible cancellations refund burned credits
 *  - Admins can cancel within 24h, but not after start
 */
import { serverSupabaseUser, serverSupabaseServiceRole, serverSupabaseClient } from '#supabase/server'
import { DateTime } from 'luxon'
import { isAdminRole, readUserRole } from '~~/server/utils/auth'
import type { RoleCarrier } from '~~/server/utils/auth'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'
import { maybeForceSyncGoogleCalendar } from '~~/server/utils/integrations/googleCalendar'
import { sendMemberBookingLifecycleMail } from '~~/server/utils/mail/memberBookingLifecycle'
import { closeGuestPaymentCheckout, findGuestPaymentSession } from '~~/server/utils/booking/guestPaymentCheckout'

const TZ = 'America/Los_Angeles'
const REFUND_WINDOW_HOURS = 24

type BookingRow = {
  id: string
  user_id: string | null
  start_time: string
  end_time: string
  status: string
  credits_burned: number | null
  booking_rate_kind?: string | null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const bookingId = getRouterParam(event, 'id')
  if (!bookingId) throw createError({ statusCode: 400, statusMessage: 'Missing booking id' })

  const role = readUserRole(user as RoleCarrier)
  const isAdmin = isAdminRole(role)

  // Use service role for admin, user client for member (RLS enforces ownership)
  const supabase = isAdmin
    ? serverSupabaseServiceRole(event)
    : await serverSupabaseClient(event)

  // 1. Fetch the booking
  const { data: rawBooking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, user_id, start_time, end_time, status, credits_burned, booking_rate_kind')
    .eq('id', bookingId)
    .maybeSingle()

  if (fetchErr) throw createError({ statusCode: 500, statusMessage: fetchErr.message })
  const booking = rawBooking as unknown as BookingRow | null
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })

  // 2. Ownership check (non-admin)
  if (!isAdmin && booking.user_id !== user.sub) {
    throw createError({ statusCode: 403, statusMessage: 'Not your booking' })
  }
  if (!isAdmin && String(booking.booking_rate_kind ?? 'standard') === 'standby') {
    throw createError({ statusCode: 409, statusMessage: 'Standby bookings cannot be canceled.' })
  }

  // 3. Only cancel active bookings
  const status = String(booking.status ?? '').toLowerCase()
  const isPendingPayment = status === 'pending_payment'
  const cancelableStatuses = ['confirmed', 'requested', 'pending_payment']
  if (!cancelableStatuses.includes(status)) {
    throw createError({
      statusCode: 409,
      statusMessage: `Cannot cancel a booking with status '${booking.status}'`
    })
  }

  // 4. Determine timing lock/refund eligibility
  const now = DateTime.now().setZone(TZ)
  const start = DateTime.fromISO(booking.start_time, { zone: TZ })
  if (!start.isValid) {
    throw createError({ statusCode: 409, statusMessage: 'This booking cannot be canceled right now. Invalid start time.' })
  }
  const hoursUntilStart = start.diff(now, 'hours').hours
  if (hoursUntilStart <= 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This booking has already started or passed and can no longer be canceled.'
    })
  }
  const eligibleForRefund = !isPendingPayment && hoursUntilStart >= REFUND_WINDOW_HOURS
  if (!isAdmin && !isPendingPayment && !eligibleForRefund) {
    throw createError({
      statusCode: 409,
      statusMessage: `This booking is within ${REFUND_WINDOW_HOURS} hours of start and can no longer be canceled.`
    })
  }
  const creditsToRefund = eligibleForRefund ? (booking.credits_burned ?? 0) : 0

  // 5. Cancel the booking (service role needed for ledger insert)
  const serviceSupabase = serverSupabaseServiceRole(event)
  if (isPendingPayment) {
    try {
      const paymentSession = await findGuestPaymentSession(serviceSupabase, bookingId, booking.user_id)
      const closeResult = await closeGuestPaymentCheckout({
        event,
        supabase: serviceSupabase,
        session: paymentSession,
        reason: 'guest_released_pending_reservation'
      })

      if (closeResult.completed || closeResult.inFlight) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Payment is already processing. Wait a moment and refresh before changing this reservation.'
        })
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) throw error
      console.error('[cancel] failed to close pending Square checkout', {
        bookingId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw createError({
        statusCode: 503,
        statusMessage: 'Could not safely close the payment checkout. Please retry before releasing this reservation.'
      })
    }
  }

  let holdsRemoved = 0
  let creditsRefunded = 0
  if (booking.user_id) {
    const canceledAt = new Date().toISOString()
    const { data: rawCancelRows, error: cancelErr } = await serviceSupabase.rpc(
      'cancel_booking_with_credit_refund',
      {
        p_user_id: booking.user_id,
        p_booking_id: bookingId,
        p_refund_amount: creditsToRefund,
        p_operation_key: `booking_cancel:${bookingId}`,
        p_metadata: {
          original_burn: booking.credits_burned,
          canceled_at: canceledAt,
          hours_before_start: Math.round(hoursUntilStart * 10) / 10,
          actioned_by: isAdmin ? 'admin' : 'member'
        }
      }
    )
    if (cancelErr) throw createError({ statusCode: 500, statusMessage: cancelErr.message })
    const cancelRow = Array.isArray(rawCancelRows) ? rawCancelRows[0] : rawCancelRows
    if (!cancelRow) throw createError({ statusCode: 500, statusMessage: 'Booking cancellation did not return a result' })
    holdsRemoved = Number(cancelRow.holds_removed ?? 0)
    creditsRefunded = Number(cancelRow.credits_refunded ?? 0)
  } else {
    const { data: linkedHolds, error: holdFetchErr } = await serviceSupabase
      .from('booking_holds')
      .select('id')
      .eq('booking_id', bookingId)
    if (holdFetchErr) throw createError({ statusCode: 500, statusMessage: holdFetchErr.message })
    holdsRemoved = linkedHolds?.length ?? 0

    const { error: cancelErr } = await serviceSupabase
      .from('bookings')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', bookingId)
    if (cancelErr) throw createError({ statusCode: 500, statusMessage: cancelErr.message })

    if (holdsRemoved > 0) {
      const { error: holdDeleteErr } = await serviceSupabase
        .from('booking_holds')
        .delete()
        .eq('booking_id', bookingId)
      if (holdDeleteErr) throw createError({ statusCode: 500, statusMessage: holdDeleteErr.message })
    }
  }

  await enqueueBookingAccessSync(event, {
    bookingId,
    reason: 'booking_cancel'
  }).catch((error) => {
    console.warn('[access/sync] failed to queue booking cancel sync', {
      bookingId,
      error: (error as Error)?.message ?? String(error)
    })
  })

  await maybeForceSyncGoogleCalendar(event, 'member_booking_cancel').catch((error) => {
    console.warn('[gcal-sync] failed to force sync after member booking cancel', {
      bookingId,
      error: (error as Error)?.message ?? String(error)
    })
  })

  if (booking.user_id && !isPendingPayment) {
    await sendMemberBookingLifecycleMail(event, {
      eventType: 'booking.memberCanceled',
      userId: booking.user_id,
      bookingId,
      bookingStart: booking.start_time,
      bookingEnd: booking.end_time,
      creditsBurned: Number(booking.credits_burned ?? 0),
      creditsRefunded,
      holdRemoved: holdsRemoved > 0,
      actionedBy: isAdmin ? 'admin' : 'member'
    })
  }

  return {
    ok: true,
    bookingId,
    status: 'canceled',
    holdsRemoved,
    creditsRefunded,
    eligible_for_refund: eligibleForRefund,
    hours_until_start: Math.round(hoursUntilStart * 10) / 10
  }
})
