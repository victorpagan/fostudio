// server/lib/payments/stripeProvider.ts
import type { PaymentsProvider, CreateCheckoutSessionInput, CreateCheckoutSessionOutput } from './providers'

export const stripeProvider: PaymentsProvider = {
  name: 'stripe',
  async createCheckoutSession(_input: CreateCheckoutSessionInput): Promise<CreateCheckoutSessionOutput> {
    // Intentionally stubbed: keeps architecture swappable without redoing your UI.
    throw new Error('Stripe provider not implemented yet.')
  }
}
