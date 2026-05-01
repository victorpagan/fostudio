type SupabaseLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ error?: { message?: string } | null }>
  from: (table: string) => {
    update: (values: Record<string, unknown>) => PendingUpdateFilter
  }
}

type PendingUpdateFilter = PromiseLike<{ error?: { message?: string } | null }> & {
  eq: (column: string, value: unknown) => PendingUpdateFilter
  is: (column: string, value: unknown) => PendingUpdateFilter
  lte: (column: string, value: unknown) => PendingUpdateFilter
  not: (column: string, operator: string, value: unknown) => PendingUpdateFilter
}

export function isActivePendingPaymentReservation(expiresAt: string | null | undefined, nowMs = Date.now()) {
  if (!expiresAt) return false
  const expiresAtMs = Date.parse(expiresAt)
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs
}

export async function expireStalePendingGuestBookings(supabase: unknown, nowIso = new Date().toISOString()) {
  const db = supabase as SupabaseLike
  const { error } = await db.rpc('expire_stale_pending_guest_bookings', { p_now: nowIso })
  if (error) {
    console.warn('[pending-guest-bookings] rpc cleanup failed; falling back to direct update', error)
    const { error: fallbackError } = await db
      .from('bookings')
      .update({
        status: 'canceled',
        updated_at: nowIso
      })
      .eq('status', 'pending_payment')
      .not('payment_expires_at', 'is', null)
      .lte('payment_expires_at', nowIso)

    if (fallbackError) {
      console.warn('[pending-guest-bookings] direct cleanup failed', fallbackError)
    }
  }

  const { error: missingExpiryError } = await db
    .from('bookings')
    .update({
      status: 'canceled',
      updated_at: nowIso
    })
    .eq('status', 'pending_payment')
    .is('payment_expires_at', null)

  if (missingExpiryError) {
    console.warn('[pending-guest-bookings] missing-expiry cleanup failed', missingExpiryError)
  }
}
