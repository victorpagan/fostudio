import assert from 'node:assert/strict'
import test from 'node:test'
import type { SquareClient } from 'square'
import { assertCardNotUsedBySubscription, assertNoLiveStudioSubscription, isLiveSquareSubscription, updateSubscriptionCard } from '../server/utils/square/subscriptionSafety.ts'
import { resolveMembershipBillingPeriod } from '../server/utils/square/billingPeriod.ts'

test('Square date-only periods use the subscription timezone, including DST', () => {
  assert.deepEqual(resolveMembershipBillingPeriod({
    cadence: 'quarterly', subscription: { startDate: '2026-09-30', chargedThroughDate: '2026-12-30', timezone: 'America/Los_Angeles' }
  }), { currentPeriodStart: '2026-09-30T07:00:00.000Z', currentPeriodEnd: '2026-12-30T08:00:00.000Z' })
  assert.equal(resolveMembershipBillingPeriod({ cadence: 'monthly', subscription: { start_date: '2026-03-01', timezone: 'America/New_York' } })?.currentPeriodEnd, '2026-04-01T04:00:00.000Z')
})

test('explicit timestamps remain instants; month arithmetic clamps month-end', () => {
  const result = resolveMembershipBillingPeriod({ cadence: 'monthly', subscription: { startDate: '2026-01-31', timezone: 'America/Los_Angeles' } })
  assert.equal(result?.currentPeriodEnd, '2026-02-28T08:00:00.000Z')
  assert.equal(resolveMembershipBillingPeriod({ cadence: 'monthly', fallbackStart: '2026-01-01T00:00:00Z', fallbackEnd: '2026-02-01T00:00:00Z' })?.currentPeriodEnd, '2026-02-01T00:00:00.000Z')
})

test('only terminal Square subscriptions allow a replacement checkout', () => {
  for (const status of ['ACTIVE', 'PENDING', 'PAUSED', undefined]) assert.equal(isLiveSquareSubscription(status), true)
  for (const status of ['CANCELED', 'DEACTIVATED']) assert.equal(isLiveSquareSubscription(status), false)
})

test('duplicate guard paginates and ignores lab subscriptions, but rejects live studio subscriptions', async () => {
  const square = { subscriptions: { search: async ({ cursor }: { cursor?: string }) => cursor
    ? { subscriptions: [{ id: 'studio-sub', status: 'ACTIVE', planVariationId: 'studio' }] }
    : { subscriptions: [{ id: 'lab-sub', status: 'ACTIVE', planVariationId: 'lab' }], cursor: 'next' }
  } } as unknown as SquareClient
  await assert.rejects(assertNoLiveStudioSubscription(square, 'customer', ['studio']), /subscription already exists/)
  await assert.doesNotReject(assertNoLiveStudioSubscription(square, 'customer', ['studio'], 'studio-sub'))
})

test('cannot disable a card used by any live customer subscription', async () => {
  const square = { subscriptions: { search: async () => ({ subscriptions: [{ id: 'sub', cardId: 'old-card', status: 'ACTIVE' }] }) } } as unknown as SquareClient
  await assert.rejects(assertCardNotUsedBySubscription(square, 'customer', 'old-card'), /still used by a subscription/)
  await assert.doesNotReject(assertCardNotUsedBySubscription(square, 'customer', 'unused-card'))
})

test('default card updates subscription and verifies the result before succeeding', async () => {
  let cardId = 'old'
  const square = { subscriptions: {
    get: async () => ({ subscription: { id: 'sub', customerId: 'customer', status: 'ACTIVE', cardId, version: 1 } }),
    update: async (request: { subscription: { cardId: string } }) => { cardId = request.subscription.cardId }
  } } as unknown as SquareClient
  await updateSubscriptionCard(square, 'sub', 'customer', 'new')
  assert.equal(cardId, 'new')
  await assert.rejects(updateSubscriptionCard(square, 'sub', 'someone-else', 'bad'), /ownership/)
  assert.equal(cardId, 'new')
})

test('unconfirmed provider card updates fail instead of reporting success', async () => {
  const square = { subscriptions: {
    get: async () => ({ subscription: { customerId: 'customer', status: 'ACTIVE', cardId: 'old' } }),
    update: async () => ({})
  } } as unknown as SquareClient
  await assert.rejects(updateSubscriptionCard(square, 'sub', 'customer', 'new'), /not confirmed/)
})
