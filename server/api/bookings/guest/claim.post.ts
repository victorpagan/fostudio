import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { resolveOrderPaymentState } from '~~/server/utils/square/orderPayment'
import { buildExpiryIsoFromDays } from '~~/server/utils/credits/buckets'
import { loadGuestBookingPolicy } from '~~/server/utils/booking/guestPolicy'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'
import { maybeForceSyncGoogleCalendar } from '~~/server/utils/integrations/googleCalendar'
import { sendMemberBookingLifecycleMail } from '~~/server/utils/mail/memberBookingLifecycle'

const bodySchema = z.object({
  token: z.string().uuid(),
  orderId: z.string().min(1).optional()
})

type TopupSessionRow = {
  id: string
  token: string
  user_id: string
  credits: number | string
  amount_cents: number | string
  status: string
  order_template_id: string | null
  payment_link_id: string | null
  created_at: string | null
  metadata: Record<string, unknown> | null
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event).catch(() => ({})))
  const supabase = serverSupabaseServiceRole(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: rawSession, error: sessionErr } = await db
    .from('credit_topup_sessions')
    .select('*')
    .eq('token', body.token)
    .eq('user_id', user.sub)
    .maybeSingle()

  if (sessionErr) throw createError({ statusCode: 500, statusMessage: sessionErr.message })
  if (!rawSession) throw createError({ statusCode: 404, statusMessage: 'Guest payment session not found' })

  const session = rawSession as TopupSessionRow
  if (readString(session.metadata, 'source') !== 'guest_booking_shortfall') {
    throw createError({ statusCode: 400, statusMessage: 'This payment session is not linked to a guest booking.' })
  }

  const bookingId = readString(session.metadata, 'booking_id')
  if (!bookingId) throw createError({ statusCode: 400, statusMessage: 'Guest payment session is missing booking metadata.' })

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id,user_id,status,start_time,end_time,credits_burned')
    .eq('id', bookingId)
    .maybeSingle()
  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })
  if (!booking || booking.user_id !== user.sub) throw createError({ statusCode: 404, statusMessage: 'Guest booking not found' })

  if (String(booking.status ?? '').toLowerCase() === 'confirmed' && String(session.status ?? '').toLowerCase() === 'processed') {
    return {
      ok: true,
      status: 'processed',
      bookingId,
      creditsAdded: asNumber(session.credits),
      creditsBurned: asNumber(booking.credits_burned)
    }
  }

  let orderId = session.order_template_id ?? body.orderId ?? null
  const square = await useSquareClient(event)
  if (!orderId && session.payment_link_id) {
    const linkRes = await square.checkout.paymentLinks.get({ id: session.payment_link_id } as never)
    const paymentLink = (linkRes as { paymentLink?: Record<string, unknown> | null }).paymentLink ?? null
    orderId = readString(paymentLink, 'orderId', 'order_id')
  }
  if (!orderId) {
    return {
      ok: false,
      status: 'pending',
      bookingId,
      message: 'Payment details are still syncing. Please retry in a moment.'
    }
  }

  const paymentState = await resolveOrderPaymentState({
    square,
    orderId,
    beginTime: session.created_at
  })

  if (!paymentState.completed) {
    return {
      ok: false,
      status: 'pending',
      bookingId,
      orderState: paymentState.orderState,
      paymentStatus: paymentState.paymentStatus,
      message: 'Guest booking payment is not completed yet.'
    }
  }

  const guestPolicy = await loadGuestBookingPolicy(event)
  const topupExpiresAt = buildExpiryIsoFromDays(guestPolicy.creditExpiryDays)
  const { data: rawResult, error: confirmErr } = await supabase.rpc('confirm_paid_guest_booking_with_burn' as never, {
    p_user_id: user.sub,
    p_booking_id: bookingId,
    p_topup_session_id: session.id,
    p_credits_purchased: asNumber(session.credits),
    p_amount_cents: Math.round(asNumber(session.amount_cents)),
    p_payment_ref: paymentState.paymentId ?? orderId,
    p_topup_expires_at: topupExpiresAt
  } as never)

  if (confirmErr) throw createError({ statusCode: 409, statusMessage: confirmErr.message })
  const result = (rawResult as unknown as Array<{
    credits_added: number | string
    credits_burned: number | string
    new_balance: number | string
  }> | null)?.[0]

  const nowIso = new Date().toISOString()
  const { error: updateErr } = await db
    .from('credit_topup_sessions')
    .update({
      status: 'processed',
      order_template_id: orderId,
      paid_at: nowIso,
      metadata: {
        ...(session.metadata ?? {}),
        payment_id: paymentState.paymentId ?? orderId,
        payment_status: paymentState.paymentStatus,
        processed_guest_booking_at: nowIso
      }
    })
    .eq('id', session.id)
  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  await enqueueBookingAccessSync(event, { bookingId, reason: 'guest_booking_payment_confirmed' }).catch((error) => {
    console.warn('[guest-booking/claim] access sync failed', { bookingId, error })
  })
  await maybeForceSyncGoogleCalendar(event, 'guest_booking_payment_confirmed').catch((error) => {
    console.warn('[guest-booking/claim] google sync failed', { bookingId, error })
  })
  await sendMemberBookingLifecycleMail(event, {
    eventType: 'booking.memberCreated',
    userId: user.sub,
    bookingId,
    bookingStart: booking.start_time,
    bookingEnd: booking.end_time,
    creditsBurned: asNumber(result?.credits_burned ?? booking.credits_burned),
    holdRequested: false,
    holdCreated: false,
    actionedBy: 'member'
  })

  return {
    ok: true,
    status: 'processed',
    bookingId,
    creditsAdded: asNumber(result?.credits_added),
    creditsBurned: asNumber(result?.credits_burned),
    newBalance: asNumber(result?.new_balance)
  }
})
