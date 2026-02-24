import { randomUUID } from 'crypto'
import { getRequestURL } from 'h3'
import type { PaymentsProvider, CreateCheckoutSessionInput, CreateCheckoutSessionOutput } from './providers'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import type { H3Event } from 'h3'

export const squareProvider: PaymentsProvider = {
  name: 'square',

  async createCheckoutSession(input: CreateCheckoutSessionInput, event: H3Event): Promise<CreateCheckoutSessionOutput> {
    const [locationId, planVariationId] = await Promise.all([
      getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID'),
      getServerConfig(event, `SQUARE_PLAN_VARIATION_${input.tier.toUpperCase()}_${input.cadence.toUpperCase()}`)
    ])

    const client = await useSquareClient(event)
    const idempotencyKey = randomUUID()
    const { origin } = getRequestURL(event)
    const redirectUrl = `${origin}/checkout/success`

    const body: any = {
      idempotencyKey,
      quickPay: {
        name: `FO Studio Membership (${input.tier} • ${input.cadence})`,
        locationId,
        subscriptionPlanId: planVariationId
      },
      checkoutOptions: { redirectUrl },
      order: {
        locationId,
        referenceId: input.membershipId,
        metadata: {
          user_id: input.userId,
          membership_id: input.membershipId,
          tier: input.tier,
          cadence: input.cadence
        }
      }
    }

    const res = await client.checkout.paymentLinks.create(body)
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
