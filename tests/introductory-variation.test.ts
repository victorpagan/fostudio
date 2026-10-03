import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SquareClient } from 'square'
import { resolveIntroductoryVariation } from '../server/utils/square/introductoryVariation.ts'
import { introductoryPhases } from '../server/utils/membership/introPricing.ts'
import { resolvePromoPricing } from '../server/utils/promos.ts'

test('intro variations reuse the same schedule and persist entitlement mapping before billing', async () => {
  let creations = 0
  let mapped = false
  let firstAmount = 33250n
  const supabase = { from: (table: string) => {
    const chain = {
      select: () => chain, eq: () => chain,
      single: async () => ({ data: { id: 'canonical-row', provider_plan_id: 'plan', cadence: 'monthly', currency: 'USD' }, error: null }),
      limit: async () => ({ data: mapped ? [{ square_variation_id: 'intro' }] : [], error: null }),
      upsert: async (row: Record<string, string>) => {
        assert.equal(table, 'membership_square_variation_aliases')
        assert.equal(row.membership_plan_variation_id, 'canonical-row')
        mapped = true
        return { error: null }
      }
    }
    return chain
  } } as unknown as SupabaseClient
  const square = { catalog: { object: {
    upsert: async (request: { object: { subscriptionPlanVariationData: { phases: unknown } } }) => {
      creations++
      assert.deepEqual(request.object.subscriptionPlanVariationData.phases, introductoryPhases('monthly', 33250, 35000, 'USD'))
      return { catalogObject: { id: 'intro' } }
    },
    get: async () => ({ object: {
      type: 'SUBSCRIPTION_PLAN_VARIATION', presentAtAllLocations: true,
      subscriptionPlanVariationData: {
        subscriptionPlanId: 'plan', phases: introductoryPhases('monthly', Number(firstAmount), 35000, 'USD')
      }
    } })
  } } } as unknown as SquareClient
  const params = { supabase, square, canonicalId: 'canonical', cadence: 'monthly', firstCents: 33250, renewalCents: 35000, currency: 'USD' }
  assert.equal(await resolveIntroductoryVariation(params), 'intro')
  assert.equal(mapped, true)
  assert.equal(await resolveIntroductoryVariation(params), 'intro')
  assert.equal(creations, 1)
  firstAmount = 35000n
  await assert.rejects(resolveIntroductoryVariation(params), /does not match/)
})

test('percentage and fixed codes only discount one month; one-off credit purchases are unchanged', async () => {
  let type = 'percent'
  let value = 5
  const supabase = { from: () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: {
      id: 'promo', code: 'INTRO', active: true, discount_type: type, discount_value: value,
      applies_to: 'all', metadata: {}, square_discount_id: 'discount', redemptions_count: 0
    }, error: null }) }
    return chain
  } }
  const params = { supabase, promoCode: 'INTRO', context: 'membership' as const, cadence: 'annual', basePriceCents: 336000 }
  assert.equal((await resolvePromoPricing(params))?.discountCents, 1400)
  type = 'fixed_cents'
  value = 40000
  assert.equal((await resolvePromoPricing(params))?.discountCents, 28000)
  assert.equal((await resolvePromoPricing({ ...params, context: 'credits' }))?.discountCents, 40000)
})
