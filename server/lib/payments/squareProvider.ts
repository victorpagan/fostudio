import { randomUUID } from 'crypto'
import { getRequestURL } from 'h3'
import type { PaymentsProvider, CreateCheckoutSessionInput, CreateCheckoutSessionOutput } from './providers'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

export const squareProvider: PaymentsProvider = {
  name: 'square',

  async createCheckoutSession(input: CreateCheckoutSessionInput, event: H3Event): Promise<CreateCheckoutSessionOutput> {
    const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
    const supabase = serverSupabaseServiceRole(event)
    const { data: variation, error: variationErr } = await supabase
      .from('membership_plan_variations')
      .select('provider_plan_variation_id,price_cents,currency,active')
      .eq('tier_id', input.tier)
      .eq('cadence', input.cadence)
      .eq('provider', 'square')
      .maybeSingle()
    if (variationErr) throw new Error(variationErr.message)
    if (!variation || !variation.active) {
      throw new Error('Selected plan variation is not active.')
    }
    const planVariationId = variation.provider_plan_variation_id?.trim()
    if (!planVariationId) {
      throw new Error('Selected plan variation is not linked to Square.')
    }
    const priceCents = Number(variation.price_cents ?? 0)
    const currency = typeof variation.currency === 'string' && variation.currency.trim()
      ? variation.currency.trim().toUpperCase()
      : 'USD'
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      throw new Error('Selected plan variation has an invalid price.')
    }
    if (priceCents > 0 && priceCents < 100) {
      throw new Error(`Selected plan variation price is below Square minimum. Expected cents, got ${priceCents}.`)
    }

    const client = await useSquareClient(event)
    const idempotencyKey = randomUUID()
    const { origin } = getRequestURL(event)
    const redirectUrl = `${origin}/checkout/success`

    const body: Record<string, unknown> = {
      idempotencyKey,
      quickPay: {
        name: `FO Studio Membership (${input.tier} • ${input.cadence})`,
        locationId,
        priceMoney: {
          amount: BigInt(Math.round(priceCents)),
          currency
        }
      },
      // Subscription plan checkout must be bound in checkoutOptions.
      checkoutOptions: { redirectUrl, subscriptionPlanId: planVariationId },
      paymentNote: `membership_id:${input.membershipId}`
    }

    const res = await client.checkout.paymentLinks.create(body as never)
    const paymentLink = res.paymentLink

    if (!paymentLink?.url) throw new Error('Square did not return a payment link URL.')

    return {
      provider: 'square',
      redirectUrl: paymentLink.url,
      externalId: paymentLink.id,
      orderTemplateId: paymentLink.orderId,
      planVariationId
    }
  }
}
