import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { findTopupBundle } from '~~/server/utils/credits/topup'

const bodySchema = z.object({
  bundle: z.enum(['single', 'bundle_3', 'bundle_5', 'bundle_10'])
})

type SquarePaymentLinkResult = {
  paymentLink?: {
    id?: string | null
    orderId?: string | null
    url?: string | null
  } | null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event))
  const bundle = findTopupBundle(body.bundle)
  if (!bundle) throw createError({ statusCode: 400, statusMessage: 'Invalid credit bundle' })

  const supabase = serverSupabaseServiceRole(event)
  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,status')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membership || (membership.status ?? '').toLowerCase() !== 'active') {
    throw createError({
      statusCode: 403,
      statusMessage: 'An active membership is required before purchasing additional credits.'
    })
  }

  const token = randomUUID()
  const { data: topupSession, error: topupErr } = await supabase
    .from('credit_topup_sessions')
    .insert({
      token,
      user_id: user.sub,
      membership_id: membership.id,
      credits: bundle.credits,
      amount_cents: bundle.amountCents,
      currency: 'USD',
      status: 'pending',
      payment_provider: 'square',
      metadata: {
        bundle_id: bundle.id,
        bundle_label: bundle.label
      }
    })
    .select('id,token')
    .single()

  if (topupErr || !topupSession) {
    throw createError({ statusCode: 500, statusMessage: topupErr?.message ?? 'Failed to create credit checkout session' })
  }

  const { origin } = getRequestURL(event)
  const redirectUrl = `${origin}/dashboard/membership?topup=${encodeURIComponent(topupSession.token)}`
  const square = await useSquareClient(event)
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')

  let createRes: SquarePaymentLinkResult
  try {
    createRes = await square.checkout.paymentLinks.create({
      idempotencyKey: randomUUID(),
      quickPay: {
        name: `Studio Credit Top-Up (${bundle.credits} credits)`,
        locationId,
        priceMoney: {
          amount: BigInt(bundle.amountCents),
          currency: 'USD'
        }
      },
      checkoutOptions: { redirectUrl },
      order: {
        locationId,
        referenceId: topupSession.id,
        buyerEmailAddress: user.email ?? undefined,
        metadata: {
          kind: 'credit_topup',
          topup_session_id: topupSession.id,
          topup_token: topupSession.token,
          user_id: user.sub,
          credits: String(bundle.credits),
          amount_cents: String(bundle.amountCents)
        }
      }
    } as never) as SquarePaymentLinkResult
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Square checkout error'
    await supabase
      .from('credit_topup_sessions')
      .update({ status: 'failed', metadata: { error: message } })
      .eq('id', topupSession.id)

    throw createError({ statusCode: 502, statusMessage: `Failed to start top-up checkout: ${message}` })
  }

  const paymentLink = createRes.paymentLink
  if (!paymentLink?.url) {
    await supabase
      .from('credit_topup_sessions')
      .update({ status: 'failed', metadata: { error: 'missing_payment_link_url' } })
      .eq('id', topupSession.id)

    throw createError({ statusCode: 500, statusMessage: 'Square did not return a payment link URL' })
  }

  const { error: saveErr } = await supabase
    .from('credit_topup_sessions')
    .update({
      payment_link_id: paymentLink.id ?? null,
      order_template_id: paymentLink.orderId ?? null
    })
    .eq('id', topupSession.id)

  if (saveErr) throw createError({ statusCode: 500, statusMessage: saveErr.message })

  return {
    redirectUrl: paymentLink.url,
    provider: 'square'
  }
})
