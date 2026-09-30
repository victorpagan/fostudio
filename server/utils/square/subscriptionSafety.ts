import { createError } from 'h3'
import type { SquareClient } from 'square'

export function isLiveSquareSubscription(status: string | null | undefined) {
  // Unknown statuses fail closed; paused/pending subscriptions can bill again.
  return !['CANCELED', 'CANCELLED', 'DEACTIVATED'].includes(String(status ?? '').toUpperCase())
}

export async function listCustomerSubscriptions(square: SquareClient, customerId: string) {
  const subscriptions = []
  let cursor: string | undefined
  const seenCursors = new Set<string>()
  do {
    const result = await square.subscriptions.search({
      query: { filter: { customerIds: [customerId] } },
      cursor
    })
    subscriptions.push(...(result.subscriptions ?? []))
    cursor = result.cursor ?? undefined
    if (cursor && seenCursors.has(cursor)) throw new Error('Subscription search pagination did not advance')
    if (cursor) seenCursors.add(cursor)
  } while (cursor)
  return subscriptions
}

export async function assertNoLiveStudioSubscription(
  square: SquareClient,
  customerId: string,
  studioVariationIds: string[],
  allowedSubscriptionId?: string | null
) {
  const subscriptions = await listCustomerSubscriptions(square, customerId)
  const existing = subscriptions.find(subscription =>
    subscription.id !== allowedSubscriptionId
    && studioVariationIds.includes(subscription.planVariationId ?? '')
    && isLiveSquareSubscription(subscription.status)
  )
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A studio subscription already exists. Manage its payment method or contact the studio instead of purchasing another membership.'
    })
  }
}

export async function assertCardNotUsedBySubscription(square: SquareClient, customerId: string, cardId: string) {
  const subscriptions = await listCustomerSubscriptions(square, customerId)
  if (subscriptions.some(subscription => subscription.cardId === cardId && isLiveSquareSubscription(subscription.status))) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This card is still used by a subscription. Set a replacement payment method for that subscription before removing it.'
    })
  }
}

export async function updateSubscriptionCard(square: SquareClient, subscriptionId: string, customerId: string, cardId: string) {
  const { subscription } = await square.subscriptions.get({ subscriptionId })
  if (!subscription || subscription.customerId !== customerId) {
    throw createError({ statusCode: 409, statusMessage: 'Subscription ownership could not be verified. Contact the studio.' })
  }
  if (!isLiveSquareSubscription(subscription.status)) return
  if (subscription.cardId === cardId) return
  await square.subscriptions.update({ subscriptionId, subscription: { cardId, version: subscription.version } })
  const { subscription: verified } = await square.subscriptions.get({ subscriptionId })
  if (verified?.cardId !== cardId) {
    throw createError({ statusCode: 502, statusMessage: 'Square has not confirmed the subscription card update. Please retry before removing the previous card.' })
  }
}
