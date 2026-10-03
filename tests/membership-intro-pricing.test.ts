import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { firstMonthPromoBase, introductoryPhases } from '../server/utils/membership/introPricing.ts'

test('membership discount basis is one month, not the entire upfront cycle', () => {
  assert.equal(firstMonthPromoBase(35000, 'monthly'), 35000)
  assert.equal(firstMonthPromoBase(94500, 'quarterly'), 31500)
  assert.equal(firstMonthPromoBase(336000, 'annual'), 28000)
  assert.equal(firstMonthPromoBase(10000, 'quarterly'), 3333)
  assert.throws(() => firstMonthPromoBase(100, 'weekly'))
  assert.throws(() => firstMonthPromoBase(Number.NaN, 'monthly'))
})

test('monthly promo ends after exactly one monthly period', () => {
  const phases = introductoryPhases('monthly', 33250, 35000, 'USD')
  assert.equal(phases[0]?.periods, 1)
  assert.equal(phases[0]?.pricing.priceMoney.amount, 33250n)
  assert.equal(phases[1]?.periods, undefined)
  assert.equal(phases[1]?.pricing.priceMoney.amount, 35000n)
  assert.equal(phases[1]?.cadence, 'MONTHLY')
})

test('annual upfront promo deducts only the first month share and renews normally', () => {
  const base = 336000
  const discount = Math.round(firstMonthPromoBase(base, 'annual') * 0.05)
  const phases = introductoryPhases('annual', base - discount, base, 'USD')
  assert.equal(discount, 1400)
  assert.equal(phases[0]?.pricing.priceMoney.amount, 334600n)
  assert.equal(phases[1]?.pricing.priceMoney.amount, 336000n)
  assert.equal(phases[0]?.cadence, 'ANNUAL')
  assert.throws(() => introductoryPhases('monthly', -1, 35000, 'USD'))
  assert.throws(() => introductoryPhases('monthly', 35001, 35000, 'USD'))
})

test('checkout and recovery cannot attach promo discounts to recurring order templates', () => {
  for (const file of ['pay', 'claim']) {
    const source = readFileSync(new URL(`../server/api/checkout/${file}.post.ts`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /requiredPhaseDiscountIds\.push\(promoSquareDiscountId\)|readPromoSquareDiscountId|readMetadataPromoSquareDiscountId/)
  }
  const pay = readFileSync(new URL('../server/api/checkout/pay.post.ts', import.meta.url), 'utf8')
  assert.match(pay, /promo_duration !== 'first_month'/)
  assert.match(pay, /resolveIntroductoryVariation/)
})
