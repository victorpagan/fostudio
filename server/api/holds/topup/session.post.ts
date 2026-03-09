import { randomUUID } from 'node:crypto'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { ensureSquareCustomerForUser } from '~~/server/utils/square/customer'
import { toSquareBuyerPhone } from '~~/server/utils/square/checkoutPrefill'

const DEFAULT_HOLD_TOPUP_LABEL = 'Overnight hold add-on'
const DEFAULT_HOLD_TOPUP_PRICE_CENTS = 2500
const DEFAULT_HOLD_TOPUP_QUANTITY = 1

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

  const supabase = serverSupabaseServiceRole(event)

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,status')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membership || (membership.status ?? '').toLowerCase() !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'An active membership is required before purchasing holds.' })
  }

  const { data: configRows, error: configErr } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', [
      'hold_topup_label',
      'hold_topup_price_cents',
      'hold_topup_quantity',
      'hold_topup_square_item_id',
      'hold_topup_square_variation_id'
    ])

  if (configErr) throw createError({ statusCode: 500, statusMessage: configErr.message })

  const config = new Map<string, unknown>()
  for (const row of configRows ?? []) {
    config.set(String(row.key), row.value)
  }

  const label = typeof config.get('hold_topup_label') === 'string'
    ? String(config.get('hold_topup_label'))
    : DEFAULT_HOLD_TOPUP_LABEL
  const amountCents = Math.floor(Number(config.get('hold_topup_price_cents') ?? DEFAULT_HOLD_TOPUP_PRICE_CENTS))
  const holds = Math.floor(Number(config.get('hold_topup_quantity') ?? DEFAULT_HOLD_TOPUP_QUANTITY))
  const squareItemId = typeof config.get('hold_topup_square_item_id') === 'string'
    ? String(config.get('hold_topup_square_item_id')).trim()
    : ''
  const squareVariationId = typeof config.get('hold_topup_square_variation_id') === 'string'
    ? String(config.get('hold_topup_square_variation_id')).trim()
    : ''

  if (!Number.isFinite(amountCents) || amountCents <= 0 || !Number.isFinite(holds) || holds <= 0) {
    throw createError({ statusCode: 503, statusMessage: 'Hold top-up is not configured.' })
  }

  const token = randomUUID()
  const { data: topupSession, error: topupErr } = await supabase
    .from('hold_topup_sessions')
    .insert({
      token,
      user_id: user.sub,
      membership_id: membership.id,
      holds,
      amount_cents: amountCents,
      currency: 'USD',
      status: 'pending',
      payment_provider: 'square',
      metadata: {
        label,
        holds,
        amount_cents: amountCents
      }
    })
    .select('id,token')
    .single()

  if (topupErr || !topupSession) {
    throw createError({ statusCode: 500, statusMessage: topupErr?.message ?? 'Failed to create hold checkout session' })
  }

  const { origin } = getRequestURL(event)
  const redirectUrl = `${origin}/dashboard/membership?hold_topup=${encodeURIComponent(topupSession.token)}`
  const square = await useSquareClient(event)
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
  const squareCustomerId = await ensureSquareCustomerForUser(event, {
    userId: user.sub,
    email: user.email ?? null
  })
  const { data: customerRow } = await supabase
    .from('customers')
    .select('email,phone,first_name,last_name')
    .eq('user_id', user.sub)
    .maybeSingle()

  let createRes: SquarePaymentLinkResult
  try {
    if (squareVariationId) {
      createRes = await square.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        checkoutOptions: { redirectUrl },
        prePopulatedData: {
          buyerEmail: customerRow?.email ?? user.email ?? undefined,
          buyerPhoneNumber: toSquareBuyerPhone(customerRow?.phone),
          buyerAddress: {
            firstName: customerRow?.first_name ?? undefined,
            lastName: customerRow?.last_name ?? undefined
          }
        },
        order: {
          locationId,
          referenceId: topupSession.id,
          customerId: squareCustomerId ?? undefined,
          buyerEmailAddress: user.email ?? undefined,
          lineItems: [
            {
              catalogObjectId: squareVariationId,
              quantity: '1'
            }
          ],
          metadata: {
            hold_topup_session_id: topupSession.id,
            hold_label: label,
            hold_quantity: String(holds),
            hold_square_item_id: squareItemId || undefined
          }
        }
      } as never) as SquarePaymentLinkResult
    } else {
      createRes = await square.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: `${label} (${holds} hold${holds === 1 ? '' : 's'})`,
          locationId,
          priceMoney: {
            amount: BigInt(amountCents),
            currency: 'USD'
          }
        },
        checkoutOptions: { redirectUrl },
        prePopulatedData: {
          buyerEmail: customerRow?.email ?? user.email ?? undefined,
          buyerPhoneNumber: toSquareBuyerPhone(customerRow?.phone),
          buyerAddress: {
            firstName: customerRow?.first_name ?? undefined,
            lastName: customerRow?.last_name ?? undefined
          }
        },
        order: {
          locationId,
          referenceId: topupSession.id,
          customerId: squareCustomerId ?? undefined,
          buyerEmailAddress: user.email ?? undefined,
          metadata: {
            hold_topup_session_id: topupSession.id,
            hold_label: label
          }
        }
      } as never) as SquarePaymentLinkResult
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Square checkout error'
    await supabase
      .from('hold_topup_sessions')
      .update({ status: 'failed', metadata: { error: message } })
      .eq('id', topupSession.id)

    throw createError({ statusCode: 502, statusMessage: `Failed to start hold checkout: ${message}` })
  }

  const paymentLink = createRes.paymentLink
  if (!paymentLink?.url) {
    await supabase
      .from('hold_topup_sessions')
      .update({ status: 'failed', metadata: { error: 'missing_payment_link_url' } })
      .eq('id', topupSession.id)

    throw createError({ statusCode: 500, statusMessage: 'Square did not return a payment link URL' })
  }

  const { error: saveErr } = await supabase
    .from('hold_topup_sessions')
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
