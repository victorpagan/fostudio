import { randomUUID } from 'crypto'
import type { PaymentsProvider, CreateCheckoutSessionInput, CreateCheckoutSessionOutput, TierId, Cadence } from './providers'
import {useSquareClient} from "~~/server/utils/square";
import type {H3Event} from "h3";

function getEnvOrThrow(key: string) {
  const v = process.env[key]
  if (!v) throw new Error(`Missing env var: ${key}`)
  return v
}

function squareEnv() {
  const env = (process.env.SQUARE_ENVIRONMENT || 'sandbox').toLowerCase()
  return env === 'production' ? Environment.Production : Environment.Sandbox
}

function planVariationEnvKey(tier: TierId, cadence: Cadence) {
  const t = tier.toUpperCase() // CREATOR / PRO / STUDIO_PLUS
  const c = cadence.toUpperCase() // MONTHLY / QUARTERLY / ANNUAL
  return `SQUARE_PLAN_VARIATION_${t}_${c}`
}

export const squareProvider: PaymentsProvider = {
  name: 'square',

  async createCheckoutSession(input: CreateCheckoutSessionInput, event: H3Event): Promise<CreateCheckoutSessionOutput> {
    const locationId = getEnvOrThrow('SQUARE_LOCATION_ID')
    const baseUrl = getEnvOrThrow('APP_BASE_URL')

    const client = useSquareClient(event)

    const envKey = planVariationEnvKey(input.tier, input.cadence)
    const planVariationId = getEnvOrThrow(envKey)

    const idempotencyKey = randomUUID()
    const redirectUrl = `${baseUrl}/checkout/success`

    const body: any = {
      idempotencyKey,
      quickPay: {
        name: `FO Studio Membership (${input.tier} • ${input.cadence})`,
        locationId,
        // IMPORTANT: Square expects the SUBSCRIPTION_PLAN_VARIATION id here
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
    const paymentLink = res.result.paymentLink

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
