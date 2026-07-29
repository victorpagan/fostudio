import type { H3Event } from 'h3'
import { useSquareClient } from '~~/server/utils/square'
import { resolveOrderPaymentState } from '~~/server/utils/square/orderPayment'

export type GuestPaymentSessionRow = {
  id: string
  user_id: string
  status: string
  amount_cents: number | string
  credits: number | string
  payment_link_id: string | null
  order_template_id: string | null
  created_at: string | null
  metadata: Record<string, unknown> | null
}

type SupabaseResult<T> = PromiseLike<{ data: T | null, error: { message?: string } | null }>

type GuestPaymentDatabase = {
  from: (table: string) => {
    select: (columns: string) => GuestPaymentQuery
    update: (values: Record<string, unknown>) => GuestPaymentQuery
  }
}

type GuestPaymentQuery = SupabaseResult<unknown> & {
  eq: (column: string, value: unknown) => GuestPaymentQuery
  order: (column: string, options: { ascending: boolean }) => GuestPaymentQuery
  limit: (count: number) => GuestPaymentQuery
  maybeSingle: () => SupabaseResult<unknown>
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function squareStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const value = (error as { statusCode?: unknown }).statusCode
  return typeof value === 'number' ? value : null
}

export function guestPaymentIssueMessage(code: string | null | undefined) {
  switch (String(code ?? '').trim().toUpperCase()) {
    case 'CVV_FAILURE':
    case 'VERIFY_CVV':
      return 'The card security code was not accepted. Re-enter the CVV exactly as shown on the card, or use another card.'
    case 'ADDRESS_VERIFICATION_FAILURE':
    case 'INVALID_POSTAL_CODE':
    case 'VERIFY_AVS':
      return 'The billing address or ZIP code was not accepted. Check it against the card statement and try again.'
    case 'INSUFFICIENT_FUNDS':
    case 'TRANSACTION_LIMIT':
      return 'The card has insufficient available funds. Use another card or contact the card issuer.'
    case 'EXPIRATION_FAILURE':
    case 'CARD_EXPIRED':
    case 'INVALID_EXPIRATION':
      return 'The card expiration date was not accepted. Check the date or use another card.'
    case 'CARD_NOT_SUPPORTED':
      return 'This card is not supported for the transaction. Please use another card.'
    case 'INVALID_ACCOUNT':
    case 'INVALID_CARD':
    case 'PAN_FAILURE':
      return 'The card number was not accepted. Check the number or use another card.'
    case 'GENERIC_DECLINE':
    case 'CARD_DECLINED':
      return 'The card was declined. Check the card details, contact the issuer, or use another card.'
    default:
      return code
        ? 'Payment was not approved. Check the card details or use another card.'
        : null
  }
}

export async function findGuestPaymentSession(
  supabase: unknown,
  bookingId: string,
  userId?: string | null
) {
  const db = supabase as GuestPaymentDatabase
  let query = db
    .from('credit_topup_sessions')
    .select('id,user_id,status,amount_cents,credits,payment_link_id,order_template_id,created_at,metadata')
    .eq('metadata->>booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message || 'Failed to load guest payment session')
  return (data ?? null) as GuestPaymentSessionRow | null
}

export async function inspectGuestPaymentCheckout(event: H3Event, session: GuestPaymentSessionRow) {
  const square = await useSquareClient(event)
  let checkoutUrl: string | null = null
  let orderId = session.order_template_id
  let linkAvailable = false

  if (session.payment_link_id) {
    try {
      const response = await square.checkout.paymentLinks.get({ id: session.payment_link_id } as never)
      const paymentLink = (response as { paymentLink?: Record<string, unknown> | null }).paymentLink ?? null
      checkoutUrl = readString(paymentLink, 'url', 'longUrl', 'long_url')
      orderId = orderId ?? readString(paymentLink, 'orderId', 'order_id')
      linkAvailable = Boolean(paymentLink && checkoutUrl)
    } catch (error) {
      if (squareStatusCode(error) !== 404) throw error
    }
  }

  const paymentState = orderId
    ? await resolveOrderPaymentState({ square, orderId, beginTime: session.created_at })
    : null

  return {
    checkoutUrl,
    linkAvailable,
    orderId,
    completed: Boolean(paymentState?.completed),
    paymentStatus: paymentState?.paymentStatus ?? null,
    orderState: paymentState?.orderState ?? null,
    paymentId: paymentState?.paymentId ?? null,
    failureCode: paymentState?.failureCode ?? null,
    issueMessage: guestPaymentIssueMessage(paymentState?.failureCode)
  }
}

export async function closeGuestPaymentCheckout(params: {
  event: H3Event
  supabase: unknown
  session: GuestPaymentSessionRow | null
  reason: string
  nowIso?: string
}) {
  const { event, supabase, session, reason } = params
  if (!session) return { closed: true, completed: false, inFlight: false }
  if (String(session.status ?? '').toLowerCase() !== 'pending') {
    return {
      closed: String(session.status ?? '').toLowerCase() === 'expired',
      completed: String(session.status ?? '').toLowerCase() === 'processed',
      inFlight: false
    }
  }

  const inspection = await inspectGuestPaymentCheckout(event, session)
  if (inspection.completed) return { closed: false, completed: true, inFlight: false }
  if (['APPROVED', 'PENDING'].includes(String(inspection.paymentStatus ?? '').toUpperCase())) {
    return { closed: false, completed: false, inFlight: true }
  }

  if (session.payment_link_id && inspection.linkAvailable) {
    const square = await useSquareClient(event)
    try {
      await square.checkout.paymentLinks.delete({ id: session.payment_link_id } as never)
    } catch (error) {
      if (squareStatusCode(error) !== 404) throw error
    }
  }

  const nowIso = params.nowIso ?? new Date().toISOString()
  const db = supabase as GuestPaymentDatabase
  const { error } = await db
    .from('credit_topup_sessions')
    .update({
      status: 'expired',
      updated_at: nowIso,
      metadata: {
        ...(session.metadata ?? {}),
        expired_at: nowIso,
        expired_reason: reason,
        square_payment_link_deleted: Boolean(session.payment_link_id)
      }
    })
    .eq('id', session.id)
    .eq('status', 'pending')

  if (error) throw new Error(error.message || 'Failed to expire guest payment session')
  return { closed: true, completed: false, inFlight: false }
}
