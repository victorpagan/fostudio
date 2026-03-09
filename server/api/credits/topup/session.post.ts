import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { getCreditOptionEffectivePriceCents, mapCreditOption } from '~~/server/utils/credits/topup'
import type { CreditPricingOptionRow } from '~~/server/utils/credits/topup'
import { ensureSquareCustomerForUser } from '~~/server/utils/square/customer'
import { toSquareBuyerPhone } from '~~/server/utils/square/checkoutPrefill'

const bodySchema = z.object({
  optionKey: z.string().min(1)
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

  const supabase = serverSupabaseServiceRole(event)
  const db = supabase as any

  const { data: rawOption, error: optionErr } = await db
    .from('credit_pricing_options')
    .select('id,key,label,description,credits,base_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,active,sort_order,square_item_id,square_variation_id')
    .eq('key', body.optionKey)
    .eq('active', true)
    .maybeSingle()

  if (optionErr) throw createError({ statusCode: 500, statusMessage: optionErr.message })
  if (!rawOption) throw createError({ statusCode: 400, statusMessage: 'Invalid credit option' })

  const option = rawOption as CreditPricingOptionRow
  const effectivePriceCents = getCreditOptionEffectivePriceCents(option)
  const mappedOption = mapCreditOption(option)

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,status,tier')
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
  const { data: topupSession, error: topupErr } = await db
    .from('credit_topup_sessions')
    .insert({
      token,
      user_id: user.sub,
      membership_id: membership.id,
      credits: mappedOption.credits,
      amount_cents: effectivePriceCents,
      currency: 'USD',
      status: 'pending',
      payment_provider: 'square',
      metadata: {
        option_id: mappedOption.id,
        option_key: mappedOption.key,
        option_label: mappedOption.label,
        base_price_cents: mappedOption.basePriceCents,
        effective_price_cents: effectivePriceCents,
        sale_active: mappedOption.saleActive
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
    if (mappedOption.squareVariationId) {
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
          metadata: {
            topup_session_id: topupSession.id,
            option_key: mappedOption.key,
            option_label: mappedOption.label
          },
          lineItems: [
            {
              catalogObjectId: mappedOption.squareVariationId,
              quantity: '1',
              note: `Credit top-up (${mappedOption.credits} credits)`
            }
          ]
        }
      } as never) as SquarePaymentLinkResult
    } else {
      createRes = await square.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: `Studio Credit Top-Up (${mappedOption.credits} credits)`,
          locationId,
          priceMoney: {
            amount: BigInt(effectivePriceCents),
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
        }
      } as never) as SquarePaymentLinkResult
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Square checkout error'
    await db
      .from('credit_topup_sessions')
      .update({ status: 'failed', metadata: { error: message } })
      .eq('id', topupSession.id)

    throw createError({ statusCode: 502, statusMessage: `Failed to start top-up checkout: ${message}` })
  }

  const paymentLink = createRes.paymentLink
  if (!paymentLink?.url) {
    await db
      .from('credit_topup_sessions')
      .update({ status: 'failed', metadata: { error: 'missing_payment_link_url' } })
      .eq('id', topupSession.id)

    throw createError({ statusCode: 500, statusMessage: 'Square did not return a payment link URL' })
  }

  const { error: saveErr } = await db
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
