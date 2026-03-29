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

const TZ = 'America/Los_Angeles'
const REFUND_WINDOW_HOURS = 24

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
  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, user_id, start_time, end_time, status, credits_burned')
    .eq('id', bookingId)
    .maybeSingle()

  if (fetchErr) throw createError({ statusCode: 500, statusMessage: fetchErr.message })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })

  // 2. Ownership check (non-admin)
  if (!isAdmin && booking.user_id !== user.sub) {
    throw createError({ statusCode: 403, statusMessage: 'Not your booking' })
  }

  // 3. Only cancel active bookings
  const cancelableStatuses = ['confirmed', 'requested']
  if (!cancelableStatuses.includes(booking.status)) {
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
  const eligibleForRefund = hoursUntilStart >= REFUND_WINDOW_HOURS
  if (!isAdmin && !eligibleForRefund) {
    throw createError({
      statusCode: 409,
      statusMessage: `This booking is within ${REFUND_WINDOW_HOURS} hours of start and can no longer be canceled.`
    })
  }
  const creditsToRefund = eligibleForRefund ? (booking.credits_burned ?? 0) : 0

  // 5. Cancel the booking (service role needed for ledger insert)
  const serviceSupabase = serverSupabaseServiceRole(event)
  const { data: linkedHolds, error: holdFetchErr } = await serviceSupabase
    .from('booking_holds')
    .select('id')
    .eq('booking_id', bookingId)

  if (holdFetchErr) throw createError({ statusCode: 500, statusMessage: holdFetchErr.message })
  const holdsRemoved = linkedHolds?.length ?? 0

  const { error: cancelErr } = await serviceSupabase
    .from('bookings')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)

  if (cancelErr) throw createError({ statusCode: 500, statusMessage: cancelErr.message })

  if (holdsRemoved > 0) {
    const { error: holdDeleteErr } = await serviceSupabase
      .from('booking_holds')
      .delete()
      .eq('booking_id', bookingId)
    if (holdDeleteErr) throw createError({ statusCode: 500, statusMessage: holdDeleteErr.message })
  }

  // 6. Refund credits if eligible
  if (creditsToRefund > 0) {
    const { error: refundErr } = await serviceSupabase
      .from('credits_ledger')
      .insert({
        user_id: booking.user_id!,
        delta: creditsToRefund,
        reason: 'refund',
        external_ref: bookingId,
        metadata: {
          booking_id: bookingId,
          original_burn: booking.credits_burned,
          canceled_at: new Date().toISOString(),
          hours_before_start: Math.round(hoursUntilStart * 10) / 10
        }
      })

    if (refundErr) {
      // Booking is already canceled — log but don't fail the request
      console.error('[cancel] credit refund failed:', refundErr)
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

  return {
    ok: true,
    bookingId,
    status: 'canceled',
    holdsRemoved,
    creditsRefunded: creditsToRefund,
    eligible_for_refund: eligibleForRefund,
    hours_until_start: Math.round(hoursUntilStart * 10) / 10
  }
})
