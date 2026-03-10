import { z } from 'zod'
import { serverSupabaseServiceRole } from '#supabase/server'
import { getRequestURL } from 'h3'
import { useSquareClient } from '~~/server/utils/square'
import { resolveOrderPaymentState } from '~~/server/utils/square/orderPayment'
import { getServerConfig } from '~~/server/utils/config/secret'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'

const bodySchema = z.object({
  token: z.string().uuid()
})

type CheckoutSessionRow = {
  id: string
  token: string
  tier: string
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  status: string
  guest_email: string | null
  payment_link_id: string | null
  order_template_id: string | null
  plan_variation_id: string | null
  claimed_by_user_id: string | null
  claimed_membership_id: string | null
  return_to: string | null
  created_at: string | null
  metadata: Record<string, unknown> | null
}

function normalizeReturnTo(value: string | null | undefined) {
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/dashboard/membership'
}

function cadenceLabel(cadence: CheckoutSessionRow['cadence']) {
  if (cadence === 'daily') return 'Daily'
  if (cadence === 'weekly') return 'Weekly'
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return 'Monthly'
}

export default defineEventHandler(async (event) => {
  const body = bodySchema.parse(await readBody(event))
  const supabase = serverSupabaseServiceRole(event)
  const db = supabase as any

  const { data: rawSession, error: sessionErr } = await db
    .from('membership_checkout_sessions')
    .select('id,token,tier,cadence,status,guest_email,payment_link_id,order_template_id,plan_variation_id,claimed_by_user_id,claimed_membership_id,return_to,created_at,metadata')
    .eq('token', body.token)
    .maybeSingle()

  if (sessionErr) throw createError({ statusCode: 500, statusMessage: sessionErr.message })
  if (!rawSession) throw createError({ statusCode: 404, statusMessage: 'Checkout session not found' })

  const session = rawSession as CheckoutSessionRow
  if (!session.guest_email) return { ok: true, sent: false, reason: 'missing_email' }
  if (session.claimed_by_user_id || session.claimed_membership_id) return { ok: true, sent: false, reason: 'already_claimed' }

  const metadata = session.metadata && typeof session.metadata === 'object'
    ? { ...session.metadata }
    : {}
  if (metadata.activation_email_sent_at) return { ok: true, sent: false, reason: 'already_sent' }

  const square = await useSquareClient(event)
  let orderId = session.order_template_id
  if (!orderId && session.payment_link_id) {
    const linkRes = await square.checkout.paymentLinks.get({ id: session.payment_link_id } as never)
    const paymentLink = (linkRes as { paymentLink?: Record<string, unknown> | null }).paymentLink ?? null
    const maybeOrderId = paymentLink?.orderId
    orderId = typeof maybeOrderId === 'string' ? maybeOrderId : null
  }
  if (!orderId) return { ok: true, sent: false, reason: 'missing_order_id' }

  const paymentState = await resolveOrderPaymentState({
    square,
    orderId,
    beginTime: session.created_at ?? null
  })
  if (!paymentState.completed) {
    return {
      ok: true,
      sent: false,
      reason: 'payment_not_completed',
      paymentStatus: paymentState.paymentStatus ?? null,
      orderState: paymentState.orderState ?? null
    }
  }

  const { data: tier, error: tierErr } = await db
    .from('membership_tiers')
    .select('id,display_name')
    .eq('id', session.tier)
    .maybeSingle()
  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })

  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID').catch(() => null)
  let templateId: string | null = null
  if (locationId && typeof locationId === 'string') {
    const { data: settingsRow } = await db
      .from('settings')
      .select('membershipCheckoutActivation')
      .eq('locationId', locationId)
      .limit(1)
      .maybeSingle()

    templateId = typeof settingsRow?.membershipCheckoutActivation === 'string'
      ? settingsRow.membershipCheckoutActivation.trim() || null
      : null
  }

  const origin = getRequestURL(event).origin
  const activationUrl = `${origin}/checkout/success?checkout=${encodeURIComponent(session.token)}&returnTo=${encodeURIComponent(normalizeReturnTo(session.return_to))}`

  let sendResult: { ok: boolean, reason?: string } = { ok: false, reason: 'unknown' }
  try {
    sendResult = await sendViaFomailer(event, {
      type: 'membership.checkoutActivationPending',
      payload: {
        to: String(session.guest_email).trim().toLowerCase(),
        locationId: typeof locationId === 'string' ? locationId : null,
        templateId,
        templateKey: 'membershipCheckoutActivation',
        tierId: session.tier,
        tierName: tier?.display_name ?? session.tier,
        cadence: session.cadence,
        cadenceLabel: cadenceLabel(session.cadence),
        activationUrl,
        checkoutToken: session.token,
        planVariationId: session.plan_variation_id,
        paymentLinkId: session.payment_link_id
      }
    })
  } catch (error) {
    console.warn('[checkout/remind-activation] fomailer send failed (non-blocking)', {
      token: session.token,
      message: error instanceof Error ? error.message : String(error)
    })
    return { ok: true, sent: false, reason: 'fomailer_error_ignored' }
  }

  if (!sendResult.ok) {
    console.warn('[checkout/remind-activation] reminder skipped (non-blocking)', {
      token: session.token,
      reason: sendResult.reason ?? 'unknown'
    })
    return {
      ok: true,
      sent: false,
      reason: sendResult.reason
    }
  }

  metadata.activation_email_sent_at = new Date().toISOString()
  metadata.activation_email_type = 'membership.checkoutActivationPending'
  metadata.activation_email_order_id = orderId

  const { error: updateErr } = await db
    .from('membership_checkout_sessions')
    .update({
      metadata
    })
    .eq('id', session.id)

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  return { ok: true, sent: true }
})
