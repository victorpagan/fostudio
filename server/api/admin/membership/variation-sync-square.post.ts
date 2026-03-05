import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

const bodySchema = z.object({
  tierId: z.string().min(1),
  cadence: z.enum(['monthly', 'quarterly', 'annual'])
})

function cadenceToSquare(cadence: 'monthly' | 'quarterly' | 'annual') {
  if (cadence === 'quarterly') return 'QUARTERLY'
  if (cadence === 'annual') return 'ANNUAL'
  return 'MONTHLY'
}

function cadenceLabel(cadence: 'monthly' | 'quarterly' | 'annual') {
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return 'Monthly'
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const [{ data: tier, error: tierErr }, { data: variation, error: varErr }] = await Promise.all([
    supabase
      .from('membership_tiers')
      .select('id,display_name')
      .eq('id', body.tierId)
      .maybeSingle(),
    supabase
      .from('membership_plan_variations')
      .select('tier_id,cadence,provider,provider_plan_id,provider_plan_variation_id,price_cents,currency')
      .eq('tier_id', body.tierId)
      .eq('provider', 'square')
      .eq('cadence', body.cadence)
      .maybeSingle()
  ])

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })
  if (varErr) throw createError({ statusCode: 500, statusMessage: varErr.message })
  if (!tier) throw createError({ statusCode: 404, statusMessage: 'Tier not found' })
  if (!variation) throw createError({ statusCode: 404, statusMessage: 'Plan variation not found' })
  if (!variation.provider_plan_id || !variation.provider_plan_variation_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Square plan IDs are missing. Create this variation in Square first.'
    })
  }

  const square = await useSquareClient(event)

  const payload = {
    idempotencyKey: randomUUID(),
    object: {
      id: variation.provider_plan_variation_id,
      type: 'SUBSCRIPTION_PLAN_VARIATION' as const,
      presentAtAllLocations: true,
      subscriptionPlanVariationData: {
        name: `${tier.display_name} ${cadenceLabel(body.cadence)}`,
        subscriptionPlanId: variation.provider_plan_id,
        phases: [
          {
            cadence: cadenceToSquare(body.cadence),
            recurringPriceMoney: {
              amount: BigInt(Number(variation.price_cents ?? 0)),
              currency: (variation.currency || 'USD').toUpperCase()
            }
          }
        ]
      }
    }
  }

  try {
    await square.catalog.object.upsert(payload as never)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Square update failed'
    throw createError({ statusCode: 502, statusMessage: message })
  }

  return {
    ok: true,
    tierId: body.tierId,
    cadence: body.cadence,
    providerPlanVariationId: variation.provider_plan_variation_id
  }
})
