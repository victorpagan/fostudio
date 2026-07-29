import type { H3Event } from 'h3'
import { closeGuestPaymentCheckout, findGuestPaymentSession } from '~~/server/utils/booking/guestPaymentCheckout'

type PendingBookingRow = {
  id: string
  user_id: string | null
  payment_expires_at: string | null
  rate_policy_snapshot: Record<string, unknown> | null
}

type PendingPaymentExpiryScope = {
  bookingId?: string
  userId?: string
  startTime?: string
  endTime?: string
  limit?: number
}

export function isActivePendingPaymentReservation(expiresAt: string | null | undefined, nowMs = Date.now()) {
  if (!expiresAt) return false
  const expiresAtMs = Date.parse(expiresAt)
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs
}

export async function expireStalePendingGuestBookings(
  event: H3Event,
  supabase: unknown,
  nowIso = new Date().toISOString(),
  scope: PendingPaymentExpiryScope = {}
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  let query = db
    .from('bookings')
    .select('id,user_id,payment_expires_at,rate_policy_snapshot')
    .eq('status', 'pending_payment')
    .or(`payment_expires_at.is.null,payment_expires_at.lte.${nowIso}`)

  if (scope.bookingId) query = query.eq('id', scope.bookingId)
  if (scope.userId) query = query.eq('user_id', scope.userId)
  if (scope.startTime && scope.endTime) {
    query = query.lt('start_time', scope.endTime).gt('end_time', scope.startTime)
  }

  const limit = Math.min(50, Math.max(1, Math.trunc(scope.limit ?? 10)))
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.warn('[pending-guest-bookings] failed to load stale reservations', error)
    return 0
  }

  let expiredCount = 0
  for (const booking of (data ?? []) as PendingBookingRow[]) {
    try {
      const session = await findGuestPaymentSession(supabase, booking.id, booking.user_id)
      const closeResult = await closeGuestPaymentCheckout({
        event,
        supabase,
        session,
        reason: 'guest_booking_payment_window_elapsed',
        nowIso
      })

      // A completed or in-flight payment must be reconciled, never canceled as unpaid.
      if (closeResult.completed || closeResult.inFlight) {
        console.warn('[pending-guest-bookings] payment requires confirmation before expiry', {
          bookingId: booking.id,
          completed: closeResult.completed,
          inFlight: closeResult.inFlight
        })
        continue
      }

      const { error: updateError } = await db
        .from('bookings')
        .update({
          status: 'canceled',
          updated_at: nowIso,
          rate_policy_snapshot: {
            ...(booking.rate_policy_snapshot ?? {}),
            expired_pending_payment_at: nowIso
          }
        })
        .eq('id', booking.id)
        .eq('status', 'pending_payment')

      if (updateError) throw new Error(updateError.message || 'Failed to expire booking')
      expiredCount += 1
    } catch (error) {
      // Fail closed: retaining a reservation is safer than canceling while Square state is unknown.
      console.warn('[pending-guest-bookings] safe expiry deferred', {
        bookingId: booking.id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return expiredCount
}
