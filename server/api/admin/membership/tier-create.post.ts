import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

const cadenceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  creditsPerMonth: z.number().int().min(0),
  priceCents: z.number().int().min(0),
  discountLabel: z.string().max(64).optional().nullable()
})

const bodySchema = z.object({
  tierId: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z][a-z0-9_]*$/, 'tierId must be lowercase snake_case'),
  displayName: z.string().min(2).max(80),
  description: z.string().max(240).optional().nullable(),
  bookingWindowDays: z.number().int().min(1).max(365).default(30),
  peakMultiplier: z.number().min(1).max(4).default(1),
  maxBank: z.number().int().min(0).max(10000).default(100),
  maxSlots: z.number().int().min(0).max(10000).optional().nullable(),
  holdsIncluded: z.number().int().min(0).max(50).default(0),
  sortOrder: z.number().int().min(0).max(1000).default(100),
  active: z.boolean().default(true),
  visible: z.boolean().default(true),
  directAccessOnly: z.boolean().default(false),
  cadences: z.object({
    monthly: cadenceConfigSchema,
    quarterly: cadenceConfigSchema,
    annual: cadenceConfigSchema
  })
})

type Cadence = 'monthly' | 'quarterly' | 'annual'

type EnabledCadenceConfig = {
  cadence: Cadence
  creditsPerMonth: number
  priceCents: number
  discountLabel: string | null
  tempVariationId: string
}

function cadenceToSquare(cadence: Cadence) {
  if (cadence === 'quarterly') return 'QUARTERLY'
  if (cadence === 'annual') return 'ANNUAL'
  return 'MONTHLY'
}

function cadenceSortOrder(cadence: Cadence) {
  if (cadence === 'quarterly') return 2
  if (cadence === 'annual') return 3
  return 1
}

function cadenceLabel(cadence: Cadence) {
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return 'Monthly'
}

function extractSquareError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message

  if (typeof error === 'object' && error !== null) {
    const errors = (error as { errors?: unknown }).errors
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0]
      if (first && typeof first === 'object') {
        const detail = (first as { detail?: unknown }).detail
        if (typeof detail === 'string' && detail.trim()) return detail.trim()
      }
    }
  }

  return 'Square catalog error'
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const enabledCadences: EnabledCadenceConfig[] = (['monthly', 'quarterly', 'annual'] as Cadence[])
    .filter(cadence => body.cadences[cadence].enabled)
    .map(cadence => ({
      cadence,
      creditsPerMonth: body.cadences[cadence].creditsPerMonth,
      priceCents: body.cadences[cadence].priceCents,
      discountLabel: body.cadences[cadence].discountLabel ?? null,
      tempVariationId: `#${body.tierId}_${cadence}_${randomUUID().slice(0, 8)}`
    }))

  if (enabledCadences.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Enable at least one billing cadence.' })
  }

  const planTempId = `#${body.tierId}_plan_${randomUUID().slice(0, 8)}`
  const initialPhase = enabledCadences[0]!

  const subscriptionPlanObject = {
    id: planTempId,
    type: 'SUBSCRIPTION_PLAN' as const,
    presentAtAllLocations: true,
    subscriptionPlanData: {
      name: body.displayName,
      phases: [
        {
          cadence: cadenceToSquare(initialPhase.cadence),
          recurringPriceMoney: {
            amount: BigInt(initialPhase.priceCents),
            currency: 'USD'
          }
        }
      ],
      subscriptionPlanVariations: enabledCadences.map(variation => ({
        id: variation.tempVariationId,
        type: 'SUBSCRIPTION_PLAN_VARIATION' as const,
        presentAtAllLocations: true,
        subscriptionPlanVariationData: {
          name: `${body.displayName} ${cadenceLabel(variation.cadence)}`,
          subscriptionPlanId: planTempId,
          phases: [
            {
              cadence: cadenceToSquare(variation.cadence),
              recurringPriceMoney: {
                amount: BigInt(variation.priceCents),
                currency: 'USD'
              }
            }
          ]
        }
      }))
    }
  }

  const square = await useSquareClient(event)

  let upsertRes: {
    idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }>
    catalogObject?: { id?: string | null } | null
  }

  try {
    upsertRes = await square.catalog.object.upsert({
      idempotencyKey: randomUUID(),
      object: subscriptionPlanObject
    } as never) as {
      idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }>
      catalogObject?: { id?: string | null } | null
    }
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: `Square plan creation failed: ${extractSquareError(error)}`
    })
  }

  const idMappings = new Map<string, string>()
  for (const mapping of upsertRes.idMappings ?? []) {
    const clientId = mapping.clientObjectId ?? ''
    const objectId = mapping.objectId ?? ''
    if (clientId && objectId) idMappings.set(clientId, objectId)
  }

  const squarePlanId = idMappings.get(planTempId) ?? upsertRes.catalogObject?.id ?? null
  if (!squarePlanId) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not resolve the created Square subscription plan ID.'
    })
  }

  const variationRows = enabledCadences.map((variation) => {
    const variationId = idMappings.get(variation.tempVariationId)
    if (!variationId) {
      throw createError({
        statusCode: 500,
        statusMessage: `Could not resolve Square variation ID for ${variation.cadence}.`
      })
    }

    return {
      tier_id: body.tierId,
      cadence: variation.cadence,
      provider: 'square',
      provider_plan_id: squarePlanId,
      provider_plan_variation_id: variationId,
      credits_per_month: variation.creditsPerMonth,
      price_cents: variation.priceCents,
      currency: 'USD',
      discount_label: variation.discountLabel,
      active: body.active,
      visible: body.directAccessOnly ? false : body.visible,
      sort_order: cadenceSortOrder(variation.cadence)
    }
  })

  const { error: tierErr } = await supabase
    .from('membership_tiers')
    .upsert({
      id: body.tierId,
      display_name: body.displayName,
      description: body.description ?? null,
      booking_window_days: body.bookingWindowDays,
      peak_multiplier: body.peakMultiplier,
      max_bank: body.maxBank,
      max_slots: body.maxSlots ?? null,
      holds_included: body.holdsIncluded,
      active: body.active,
      visible: body.directAccessOnly ? false : body.visible,
      direct_access_only: body.directAccessOnly,
      sort_order: body.sortOrder
    }, {
      onConflict: 'id'
    })

  if (tierErr) {
    throw createError({ statusCode: 500, statusMessage: tierErr.message })
  }

  const { error: variationErr } = await supabase
    .from('membership_plan_variations')
    .upsert(variationRows, {
      onConflict: 'tier_id,cadence,provider'
    })

  if (variationErr) {
    throw createError({ statusCode: 500, statusMessage: variationErr.message })
  }

  const disabledCadences = (['monthly', 'quarterly', 'annual'] as Cadence[]).filter(
    cadence => !enabledCadences.some(item => item.cadence === cadence)
  )

  if (disabledCadences.length > 0) {
    const { error: disableErr } = await supabase
      .from('membership_plan_variations')
      .update({
        active: false,
        visible: false
      })
      .eq('tier_id', body.tierId)
      .eq('provider', 'square')
      .in('cadence', disabledCadences)

    if (disableErr) {
      throw createError({ statusCode: 500, statusMessage: disableErr.message })
    }
  }

  return {
    ok: true,
    tierId: body.tierId,
    squarePlanId,
    directAccessOnly: body.directAccessOnly,
    checkoutLinks: enabledCadences.map(variation => ({
      cadence: variation.cadence,
      url: `/checkout?tier=${encodeURIComponent(body.tierId)}&cadence=${variation.cadence}&returnTo=${encodeURIComponent('/dashboard/admin')}`
    })),
    variationIds: variationRows.map(row => ({
      cadence: row.cadence,
      providerPlanVariationId: row.provider_plan_variation_id
    }))
  }
})
