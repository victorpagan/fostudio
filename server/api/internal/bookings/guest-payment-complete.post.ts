import { z } from 'zod'
import { getHeader } from 'h3'
import { getKey } from '~~/server/utils/config/secret'
import { requireServerAdmin } from '~~/server/utils/auth'
import { serverSupabaseServiceRole } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { resolveOrderPaymentState } from '~~/server/utils/square/orderPayment'
import { buildExpiryIsoFromDays } from '~~/server/utils/credits/buckets'
import { loadGuestBookingPolicy } from '~~/server/utils/booking/guestPolicy'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'
import { maybeForceSyncGoogleCalendar } from '~~/server/utils/integrations/googleCalendar'

const bodySchema = z.object({
  bookingId: z.string().uuid().optional(),
  topupToken: z.string().uuid().optional(),
  orderId: z.string().min(1).optional()
}).refine(value => Boolean(value.bookingId || value.topupToken), {
  message: 'bookingId or topupToken is required'
})

function readBearerOrHeaderKey(event: Parameters<typeof getHeader>[0]) {
  const explicit = getHeader(event, 'x-access-key')
  if (explicit) return explicit.trim()
  const auth = getHeader(event, 'authorization')
  const match = auth?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

async function requireInternalAccessAuth(event: Parameters<typeof getHeader>[0]) {
  const expected = await getKey(event, 'ACCESS_AUTOMATION_SHARED_KEY').catch(() => null)
  const provided = readBearerOrHeaderKey(event)
  if (typeof expected === 'string' && expected.trim() && provided === expected.trim()) {
    return { mode: 'shared_key' as const }
  }
  await requireServerAdmin(event)
  return { mode: 'admin' as const }
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export default defineEventHandler(async (event) => {
  const auth = await requireInternalAccessAuth(event)
  const body = bodySchema.parse(await readBody(event))
  const supabase = serverSupabaseServiceRole(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  let query = db.from('credit_topup_sessions').select('*')
  if (body.topupToken) query = query.eq('token', body.topupToken)
  else query = query.contains('metadata', { booking_id: body.bookingId })
  const { data: session, error: sessionErr } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (sessionErr) throw createError({ statusCode: 500, statusMessage: sessionErr.message })
  if (!session) throw createError({ statusCode: 404, statusMessage: 'Guest payment session not found' })

  const metadata = (session.metadata ?? {}) as Record<string, unknown>
  const bookingId = String(metadata.booking_id ?? body.bookingId ?? '')
  if (!bookingId) throw createError({ statusCode: 400, statusMessage: 'Guest payment session is missing booking id' })

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id,user_id,status')
    .eq('id', bookingId)
    .maybeSingle()
  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })
  if (!booking?.user_id) throw createError({ statusCode: 404, statusMessage: 'Guest booking not found' })

  let orderId = session.order_template_id ?? body.orderId ?? null
  const square = await useSquareClient(event)
  if (!orderId && session.payment_link_id) {
    const linkRes = await square.checkout.paymentLinks.get({ id: session.payment_link_id } as never)
    const paymentLink = (linkRes as { paymentLink?: Record<string, unknown> | null }).paymentLink ?? null
    const rawOrderId = paymentLink?.orderId ?? paymentLink?.order_id
    orderId = typeof rawOrderId === 'string' && rawOrderId.trim() ? rawOrderId.trim() : null
  }
  if (!orderId) throw createError({ statusCode: 409, statusMessage: 'Payment order is not available yet' })

  const paymentState = await resolveOrderPaymentState({ square, orderId, beginTime: session.created_at })
  if (!paymentState.completed) {
    throw createError({ statusCode: 409, statusMessage: 'Payment is not completed yet' })
  }

  const guestPolicy = await loadGuestBookingPolicy(event)
  const { data: rawResult, error: confirmErr } = await supabase.rpc('confirm_paid_guest_booking_with_burn' as never, {
    p_user_id: booking.user_id,
    p_booking_id: bookingId,
    p_topup_session_id: session.id,
    p_credits_purchased: asNumber(session.credits),
    p_amount_cents: Math.round(asNumber(session.amount_cents)),
    p_payment_ref: paymentState.paymentId ?? orderId,
    p_topup_expires_at: buildExpiryIsoFromDays(guestPolicy.creditExpiryDays)
  } as never)
  if (confirmErr) throw createError({ statusCode: 409, statusMessage: confirmErr.message })

  await db
    .from('credit_topup_sessions')
    .update({
      status: 'processed',
      order_template_id: orderId,
      paid_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        payment_id: paymentState.paymentId ?? orderId,
        processed_by_internal_endpoint: true,
        processed_auth_mode: auth.mode
      }
    })
    .eq('id', session.id)

  await enqueueBookingAccessSync(event, { bookingId, reason: 'guest_payment_complete' }).catch(() => null)
  await maybeForceSyncGoogleCalendar(event, 'guest_payment_complete').catch(() => null)

  return {
    ok: true,
    bookingId,
    result: (rawResult as unknown[] | null)?.[0] ?? null
  }
})
