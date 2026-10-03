import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSubscriptionCreatePhasesFromPlanVariation } from '../server/utils/square/subscriptionPhases.ts'

function squareWithPhase(phase: Record<string, unknown>) {
  return { catalog: { object: { get: async ({ objectId }: { objectId: string }) => ({
    object: objectId === 'variation'
      ? { subscriptionPlanVariationData: { subscriptionPlanId: 'plan', phases: [phase] } }
      : { subscriptionPlanData: {} }
  }) } } }
}

test('relative phase UID is never used as an order template ID', async () => {
  const phases = await buildSubscriptionCreatePhasesFromPlanVariation(squareWithPhase({
    uid: 'C7YAIDK2RWD5A7OFEECOQII7', planPhaseUid: 'another-phase-id',
    ordinal: 0, cadence: 'MONTHLY', pricing: { type: 'RELATIVE' }
  }), 'variation')
  assert.equal(phases?.length, 1)
  assert.equal(phases?.[0]?.orderTemplateId, undefined)
  assert.equal(phases?.[0]?.ordinal, 0n)
})

test('explicit order references and discounts are preserved', async () => {
  const phases = await buildSubscriptionCreatePhasesFromPlanVariation(squareWithPhase({
    uid: 'phase-id', order_template_id: 'actual-draft-order', ordinal: 0,
    cadence: 'QUARTERLY', pricing: { type: 'RELATIVE', discount_ids: ['discount'] }
  }), 'variation')
  assert.equal(phases?.[0]?.orderTemplateId, 'actual-draft-order')
  assert.deepEqual(phases?.[0]?.pricing, { type: 'RELATIVE', discountIds: ['discount'] })
})

test('static pricing keeps the existing implicit-phase behavior', async () => {
  const phases = await buildSubscriptionCreatePhasesFromPlanVariation(squareWithPhase({
    uid: 'phase-id', ordinal: 0, cadence: 'MONTHLY',
    pricing: { type: 'STATIC', priceMoney: { amount: 35000, currency: 'USD' } }
  }), 'variation')
  assert.equal(phases, null)
})
