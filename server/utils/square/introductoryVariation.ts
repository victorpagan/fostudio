import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SquareClient } from 'square'
import { introductoryPhases } from '../membership/introPricing'

// Separate immutable pricing prevents promo discounts leaking into renewals.
export async function resolveIntroductoryVariation(params: {
  supabase: SupabaseClient
  square: SquareClient
  canonicalId: string
  cadence: string
  firstCents: number
  renewalCents: number
  currency: string
}) {
  const { supabase, square, canonicalId, cadence, firstCents, renewalCents, currency } = params
  const phases = introductoryPhases(cadence, firstCents, renewalCents, currency)
  const key = createHash('sha256').update(JSON.stringify([canonicalId, cadence, firstCents, renewalCents, currency])).digest('hex')
  const reason = `first-month-promo:v1:${key}`
  const { data: canonical, error: canonicalError } = await supabase.from('membership_plan_variations')
    .select('id,provider_plan_id,cadence,currency').eq('provider', 'square').eq('provider_plan_variation_id', canonicalId).eq('active', true).single()
  if (canonicalError || !canonical?.provider_plan_id || canonical.cadence !== cadence || canonical.currency !== currency) throw new Error('Canonical membership plan is unavailable.')
  const { data: aliases, error: aliasError } = await supabase.from('membership_square_variation_aliases')
    .select('square_variation_id').eq('membership_plan_variation_id', canonical.id).eq('reason', reason).limit(1)
  if (aliasError) throw aliasError
  let id = aliases?.[0]?.square_variation_id as string | undefined
  if (!id) {
    const response = await square.catalog.object.upsert({
      idempotencyKey: `intro-${key}`,
      object: {
        type: 'SUBSCRIPTION_PLAN_VARIATION', id: '#intro', presentAtAllLocations: true,
        subscriptionPlanVariationData: {
          name: `FO Studio ${cadence} - first month promo ${key.slice(0, 8)}`,
          subscriptionPlanId: canonical.provider_plan_id,
          phases
        }
      }
    } as never)
    id = response.catalogObject?.id
    if (!id) throw new Error('Square did not return an introductory variation.')
    const { error } = await supabase.from('membership_square_variation_aliases').upsert({
      square_variation_id: id, membership_plan_variation_id: canonical.id, reason
    }, { onConflict: 'square_variation_id' })
    if (error) throw error
  }
  // Read back cached schedules too; never bill an edited or disabled variant.
  const response = await square.catalog.object.get({ objectId: id })
  const object = response.object
  const actual = object?.type === 'SUBSCRIPTION_PLAN_VARIATION' ? object.subscriptionPlanVariationData : null
  if (!object?.presentAtAllLocations || !actual || actual.subscriptionPlanId !== canonical.provider_plan_id
    || actual.phases.length !== 2 || actual.phases.some((phase, index) => {
    const expected = phases[index]!
    return Number(phase.ordinal) !== index || phase.cadence !== expected.cadence
      || (index === 0 ? phase.periods !== 1 : phase.periods != null)
      || phase.pricing?.type !== 'STATIC'
      || Number(phase.pricing.priceMoney?.amount) !== Number(expected.pricing.priceMoney.amount)
      || phase.pricing.priceMoney?.currency !== currency
  })) throw new Error('Square introductory pricing does not match the checkout. No payment was attempted.')
  return id
}
