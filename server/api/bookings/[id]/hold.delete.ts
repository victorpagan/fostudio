import { DateTime } from 'luxon'
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { isAdminRole, readUserRole } from '~~/server/utils/auth'
import type { RoleCarrier } from '~~/server/utils/auth'

const TZ = 'America/Los_Angeles'
const HOLD_RETURN_WINDOW_HOURS = 24

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const bookingId = getRouterParam(event, 'id')
  if (!bookingId) throw createError({ statusCode: 400, statusMessage: 'Missing booking id' })

  const role = readUserRole(user as RoleCarrier)
  const isAdmin = isAdminRole(role)
  const readClient = isAdmin
    ? serverSupabaseServiceRole(event)
    : await serverSupabaseClient(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data: booking, error: bookingErr } = await readClient
    .from('bookings')
    .select('id,user_id,status,start_time')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  if (!isAdmin && booking.user_id !== user.sub) {
    throw createError({ statusCode: 403, statusMessage: 'Not your booking' })
  }

  const bookingStatus = String(booking.status ?? '').toLowerCase()
  if (!['confirmed', 'requested', 'pending_payment'].includes(bookingStatus)) {
    throw createError({ statusCode: 409, statusMessage: `Cannot modify hold for booking in status '${booking.status}'` })
  }

  const { data: holdRows, error: holdErr } = await supabase
    .from('booking_holds')
    .select('id')
    .eq('booking_id', booking.id)

  if (holdErr) throw createError({ statusCode: 500, statusMessage: holdErr.message })
  if (!holdRows?.length) {
    return {
      ok: true,
      bookingId: booking.id,
      holdsRemoved: 0,
      holdReturned: 0,
      eligible_for_hold_return: false,
      hours_until_start: null,
      message: 'No active hold was attached to this booking.'
    }
  }

  const now = DateTime.now().setZone(TZ)
  const start = DateTime.fromISO(booking.start_time, { zone: TZ })
  const hoursUntilStart = start.diff(now, 'hours').hours
  const eligibleForHoldReturn = hoursUntilStart >= HOLD_RETURN_WINDOW_HOURS

  const { error: holdDeleteErr } = await supabase
    .from('booking_holds')
    .delete()
    .eq('booking_id', booking.id)

  if (holdDeleteErr) throw createError({ statusCode: 500, statusMessage: holdDeleteErr.message })

  let holdReturned = 0
  if (eligibleForHoldReturn && booking.user_id) {
    const { data: burnRows, error: burnErr } = await supabase
      .from('hold_ledger')
      .select('delta')
      .eq('user_id', booking.user_id)
      .eq('reason', 'booking_hold')
      .eq('external_ref', booking.id)

    if (burnErr) throw createError({ statusCode: 500, statusMessage: burnErr.message })

    const consumedPaidHolds = Math.abs((burnRows ?? []).reduce((sum, row) => {
      const delta = asNumber(row?.delta)
      return delta < 0 ? sum + delta : sum
    }, 0))

    if (consumedPaidHolds > 0) {
      const { data: existingRefundRows, error: refundReadErr } = await supabase
        .from('hold_ledger')
        .select('delta')
        .eq('user_id', booking.user_id)
        .eq('reason', 'booking_hold_refund')
        .eq('external_ref', booking.id)

      if (refundReadErr) throw createError({ statusCode: 500, statusMessage: refundReadErr.message })

      const refundedAlready = (existingRefundRows ?? []).reduce((sum, row) => {
        const delta = asNumber(row?.delta)
        return delta > 0 ? sum + delta : sum
      }, 0)

      holdReturned = Math.max(0, consumedPaidHolds - refundedAlready)
      if (holdReturned > 0) {
        const { error: refundInsertErr } = await supabase
          .from('hold_ledger')
          .insert({
            user_id: booking.user_id,
            delta: holdReturned,
            reason: 'booking_hold_refund',
            external_ref: booking.id,
            metadata: {
              source: 'booking_hold_cancel',
              booking_id: booking.id,
              refunded_at: new Date().toISOString(),
              hours_before_start: Math.round(hoursUntilStart * 10) / 10
            }
          })
        if (refundInsertErr) throw createError({ statusCode: 500, statusMessage: refundInsertErr.message })
      }
    }
  }

  return {
    ok: true,
    bookingId: booking.id,
    holdsRemoved: holdRows.length,
    holdReturned,
    eligible_for_hold_return: eligibleForHoldReturn,
    hours_until_start: Math.round(hoursUntilStart * 10) / 10,
    message: holdReturned > 0
      ? `${holdReturned} hold token${holdReturned === 1 ? '' : 's'} returned.`
      : eligibleForHoldReturn
        ? 'Hold removed.'
        : 'Hold removed. Hold token is forfeited within 24 hours of start.'
  }
})
