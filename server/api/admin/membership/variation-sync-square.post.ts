import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

const bodySchema = z.object({
  tierId: z.string().min(1),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual'])
})

function cadenceToSquare(cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual') {
  if (cadence === 'daily') return 'DAILY'
  if (cadence === 'weekly') return 'WEEKLY'
  if (cadence === 'quarterly') return 'QUARTERLY'
  if (cadence === 'annual') return 'ANNUAL'
  return 'MONTHLY'
}

function cadenceLabel(cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual') {
  if (cadence === 'daily') return 'Daily'
  if (cadence === 'weekly') return 'Weekly'
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return 'Monthly'
}

function parseSquareErrorDetailFromMessage(message: string) {
  const bodyIndex = message.indexOf('Body:')
  if (bodyIndex >= 0) {
    const rawBody = message.slice(bodyIndex + 5).trim()
    try {
      const parsed = JSON.parse(rawBody) as { errors?: Array<{ detail?: string }> }
      const detail = parsed.errors?.[0]?.detail
      if (typeof detail === 'string' && detail.trim()) return detail.trim()
    } catch {
      // ignore parse errors and fall through to regex extraction
    }
  }

  const detailMatch = message.match(/"detail"\s*:\s*"([^"]+)"/)
  if (detailMatch?.[1]) return detailMatch[1]
  return null
}

function isImmutablePhaseError(message: string) {
  return message.toLowerCase().includes('phases should not be added, removed, or replaced')
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

  const priceCents = Number(variation.price_cents ?? 0)
  if (priceCents !== 0 && priceCents < 100) {
    throw createError({
      statusCode: 400,
      statusMessage: `${cadenceLabel(body.cadence)} price must be at least 100 cents ($1.00), or exactly 0 for a free plan.`
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
            pricing: {
              type: 'STATIC' as const,
              priceMoney: {
                amount: BigInt(priceCents),
                currency: (variation.currency || 'USD').toUpperCase()
              }
            }
          }
        ]
      }
    }
  }

  try {
    await square.catalog.object.upsert(payload as never)
  } catch (error) {
    const message = error instanceof Error
      ? parseSquareErrorDetailFromMessage(error.message) ?? error.message
      : 'Square update failed'
    if (isImmutablePhaseError(message)) {
      throw createError({
        statusCode: 400,
        statusMessage: `${cadenceLabel(body.cadence)} variation is already locked in Square and cannot have phases replaced. Create a fresh Square variation for this cadence, or edit pricing in Square directly.`
      })
    }
    throw createError({ statusCode: 502, statusMessage: message })
  }

  return {
    ok: true,
    tierId: body.tierId,
    cadence: body.cadence,
    providerPlanVariationId: variation.provider_plan_variation_id
  }
})
