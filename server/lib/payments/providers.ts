import type {H3Event} from "h3";

export type TierId = 'creator' | 'pro' | 'studio_plus'
export type Cadence = 'monthly' | 'quarterly' | 'annual'
export type ProviderName = 'square' | 'stripe'

export type CreateCheckoutSessionInput = {
  userId: string
  membershipId: string
  tier: TierId
  cadence: Cadence
  customerEmail?: string | null
  customerPhone?: string | null
}

export type CreateCheckoutSessionOutput = {
  provider: ProviderName
  redirectUrl: string
  externalId?: string
  orderTemplateId?: string
  planVariationId?: string
}

export interface PaymentsProvider {
  name: ProviderName
  createCheckoutSession(input: CreateCheckoutSessionInput, event: H3Event): Promise<CreateCheckoutSessionOutput>
}
