import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

const cadenceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  creditsPerMonth: z.number().int().min(0),
  priceCents: z.number().int().min(0),
  discountLabel: z.string().max(64).optional().nullable(),
  providerPlanId: z.string().optional().nullable(),
  providerPlanVariationId: z.string().optional().nullable(),
  currency: z.string().optional().default('USD'),
  visible: z.boolean().default(true),
  sortOrder: z.number().int().optional()
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
    daily: cadenceConfigSchema,
    weekly: cadenceConfigSchema,
    monthly: cadenceConfigSchema,
    quarterly: cadenceConfigSchema,
    annual: cadenceConfigSchema
  })
})

type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

type EnabledCadenceConfig = {
  cadence: Cadence
  creditsPerMonth: number
  priceCents: number
  discountLabel: string | null
  providerPlanId: string | null
  providerPlanVariationId: string | null
  currency: string
  visible: boolean
  sortOrder: number | undefined
}

function cadenceToSquare(cadence: Cadence) {
  if (cadence === 'daily') return 'DAILY'
  if (cadence === 'weekly') return 'WEEKLY'
  if (cadence === 'quarterly') return 'QUARTERLY'
  if (cadence === 'annual') return 'ANNUAL'
  return 'MONTHLY'
}

function cadenceSortOrder(cadence: Cadence) {
  if (cadence === 'daily') return 1
  if (cadence === 'weekly') return 2
  if (cadence === 'monthly') return 3
  if (cadence === 'quarterly') return 4
  if (cadence === 'annual') return 5
  return 6
}

function cadenceLabel(cadence: Cadence) {
  if (cadence === 'daily') return 'Daily'
  if (cadence === 'weekly') return 'Weekly'
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return 'Monthly'
}

type DiscountShape = {
  type: 'percent' | 'dollar'
  amount: string
}

function parseDiscountLabel(label: string | null | undefined): DiscountShape | null {
  const raw = (label ?? '').trim()
  if (!raw) return null

  const percentMatch = raw.match(/(-?\d+(?:\.\d+)?)\s*%/)
  if (percentMatch) return { type: 'percent', amount: percentMatch[1] }

  const percentWordMatch = raw.match(/(-?\d+(?:\.\d+)?)\s*(?:percent|pct|off)?$/i)
  if (percentWordMatch && !raw.includes('$')) {
    return { type: 'percent', amount: percentWordMatch[1] }
  }

  const dollarMatch = raw.match(/\$\s*(-?\d+(?:\.\d+)?)/)
  if (dollarMatch) {
    return { type: 'dollar', amount: dollarMatch[1] }
  }

  return null
}

function buildDiscountObjectsPayload(
  tierId: string,
  displayName: string,
  variationCadence: Cadence,
  discount: DiscountShape
) {
  const amount = Number(discount.amount)
  if (!Number.isFinite(amount) || amount < 0) return null

  const normalizedAmount = Number.isInteger(amount) ? String(amount) : Number(amount.toFixed(2)).toString()
  const discountTempId = `#${tierId}_${variationCadence}_discount_${randomUUID().slice(0, 8)}`

  if (discount.type === 'percent') {
    if (amount > 100) return null
    return {
      kind: 'percent' as const,
      tempObjectId: discountTempId,
      object: {
        id: discountTempId,
        type: 'DISCOUNT' as const,
        discountData: {
          name: `${displayName} - ${cadenceLabel(variationCadence)} ${normalizedAmount}%`,
          discountType: 'FIXED_PERCENTAGE' as const,
          percentage: normalizedAmount
        }
      }
    }
  }

  return {
    kind: 'dollar' as const,
    tempObjectId: discountTempId,
    object: {
      id: discountTempId,
      type: 'DISCOUNT' as const,
      discountData: {
        name: `${displayName} - ${cadenceLabel(variationCadence)} $${normalizedAmount}`,
        discountType: 'FIXED_AMOUNT' as const,
        amountMoney: {
          amount: BigInt(Math.round(amount * 100)),
          currency: 'USD'
        }
      }
    }
  }
}

function buildSquarePhase(
  cadence: Cadence,
  priceCents: number,
  currency: string,
  discountObjectIds: string[] = []
) {
  if (discountObjectIds.length === 0) {
    return {
      cadence: cadenceToSquare(cadence),
      pricing: {
        type: 'RELATIVE' as const
      }
    }
  }

  return {
    cadence: cadenceToSquare(cadence),
    pricing: {
      type: 'RELATIVE' as const,
      discountIds: discountObjectIds
    }
  }
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

function extractSquareError(error: unknown): string {
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

  if (error instanceof Error && error.message) {
    const parsedDetail = parseSquareErrorDetailFromMessage(error.message)
    if (parsedDetail) return parsedDetail
    return error.message
  }

  return 'Square catalog error'
}

function isImmutablePhaseError(message: string) {
  return message.toLowerCase().includes('phases should not be added, removed, or replaced')
}

type SquareUpsertResponse = {
  idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }>
  catalogObject?: { id?: string | null } | null
}

function resolveCatalogObjectId(
  requestedId: string,
  idMappings: Array<{ clientObjectId?: string | null, objectId?: string | null }>,
  fallbackId: string | null
) {
  return idMappings.find(item => item.clientObjectId === requestedId)?.objectId ?? fallbackId
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const cadenceOrder = ['daily', 'weekly', 'monthly', 'quarterly', 'annual'] as Cadence[]
  const allCadences = cadenceOrder.map((cadence) => {
    const config = body.cadences[cadence]
    return {
      cadence,
      enabled: config.enabled,
      creditsPerMonth: config.creditsPerMonth,
      priceCents: config.priceCents,
      discountLabel: config.discountLabel ?? null,
      providerPlanId: config.providerPlanId?.trim() || null,
      providerPlanVariationId: config.providerPlanVariationId?.trim() || null,
      currency: (config.currency || 'USD').toUpperCase(),
      visible: config.visible,
      sortOrder: config.sortOrder
    }
  })

  const enabledCadences: EnabledCadenceConfig[] = cadenceOrder
    .map(cadence => allCadences.find(row => row.cadence === cadence)!)
    .filter(cadence => cadence.enabled)

  if (enabledCadences.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Enable at least one billing cadence.' })
  }

  const tooLowPriceCadence = enabledCadences.find(cadence => cadence.priceCents !== 0 && cadence.priceCents < 100)
  if (tooLowPriceCadence) {
    throw createError({
      statusCode: 400,
      statusMessage: `${cadenceLabel(tooLowPriceCadence.cadence)} price must be at least 100 cents ($1.00), or exactly 0 for a free plan.`
    })
  }

  const knownPlanIds = new Set<string>(
    enabledCadences
      .map(cadence => cadence.providerPlanId)
      .filter((id): id is string => Boolean(id))
  )
  if (knownPlanIds.size > 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Enabled cadences must share the same Square plan ID.'
    })
  }

  const square = await useSquareClient(event)

  let squarePlanId = Array.from(knownPlanIds)[0] ?? null
  const resolvedVariationIds = new Map<Cadence, string>()
  let squareItemId: string | null = null
  const discountIdsByCadence = new Map<Cadence, string>()
  const createdDiscountIds: string[] = []

  const discountPayloads = enabledCadences
    .map((variation) => {
      const parsedDiscount = parseDiscountLabel(variation.discountLabel)
      if (!parsedDiscount) return null

      const payload = buildDiscountObjectsPayload(
        body.tierId,
        body.displayName,
        variation.cadence,
        parsedDiscount
      )

      if (!payload) return null

      return {
        cadence: variation.cadence,
        payload
      }
    })
    .filter((item): item is { cadence: Cadence, payload: ReturnType<typeof buildDiscountObjectsPayload> } => Boolean(item))

  for (const { cadence, payload } of discountPayloads) {
    const discountRes = await square.catalog.object.upsert({
      idempotencyKey: randomUUID(),
      object: payload.object
    } as never) as SquareUpsertResponse

    const resolvedDiscountId = resolveCatalogObjectId(
      payload.tempObjectId,
      discountRes.idMappings ?? [],
      discountRes.catalogObject?.id ?? null
    )

    if (!resolvedDiscountId) {
      throw createError({
        statusCode: 500,
        statusMessage: `Could not resolve Square discount ID for ${cadenceLabel(cadence)}.`
      })
    }

    discountIdsByCadence.set(cadence, resolvedDiscountId)
    createdDiscountIds.push(resolvedDiscountId)
  }

  if (!squarePlanId) {
    const baseCadence = enabledCadences.find(cadence => cadence.cadence === 'monthly') ?? enabledCadences[0]!
    const squareItemTempId = `#${body.tierId}_item_${randomUUID().slice(0, 8)}`
    const squareItemVariationTempId = `#${body.tierId}_item_variation_${randomUUID().slice(0, 8)}`

    const itemUpsertRes = await square.catalog.object.upsert({
      idempotencyKey: randomUUID(),
      object: {
        id: squareItemTempId,
        type: 'ITEM',
        presentAtAllLocations: true,
        itemData: {
          name: `${body.displayName} membership`,
          variations: [
            {
              id: squareItemVariationTempId,
              type: 'ITEM_VARIATION',
              presentAtAllLocations: true,
              itemVariationData: {
                name: `${body.displayName} Base`,
                pricingType: 'FIXED_PRICING',
                priceMoney: {
                  amount: BigInt(baseCadence.priceCents),
                  currency: baseCadence.currency
                }
              }
            }
          ]
        }
      }
    } as never) as SquareUpsertResponse

    squareItemId = resolveCatalogObjectId(
      squareItemTempId,
      itemUpsertRes.idMappings ?? [],
      itemUpsertRes.catalogObject?.id ?? null
    )
    if (!squareItemId) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Could not resolve the created Square base item ID.'
      })
    }

    const cleanupSquareItemId = squareItemId

    const planTempId = `#${body.tierId}_plan_${randomUUID().slice(0, 8)}`
    const tempVariationIds = new Map<Cadence, string>()
    for (const variation of enabledCadences) {
      tempVariationIds.set(variation.cadence, `#${body.tierId}_${variation.cadence}_${randomUUID().slice(0, 8)}`)
    }

    const subscriptionPlanObject = {
      id: planTempId,
      type: 'SUBSCRIPTION_PLAN' as const,
      presentAtAllLocations: true,
      subscriptionPlanData: {
        name: body.displayName,
        eligibleItemIds: squareItemId ? [squareItemId] : [],
        subscriptionPlanVariations: enabledCadences.map(variation => ({
          id: tempVariationIds.get(variation.cadence)!,
          type: 'SUBSCRIPTION_PLAN_VARIATION' as const,
          presentAtAllLocations: true,
          subscriptionPlanVariationData: {
            name: `${body.displayName} ${cadenceLabel(variation.cadence)}`,
            subscriptionPlanId: planTempId,
            phases: [
              buildSquarePhase(
                variation.cadence,
                variation.priceCents,
                variation.currency,
                discountIdsByCadence.get(variation.cadence)
                  ? [discountIdsByCadence.get(variation.cadence)!]
                  : []
              )
            ]
          }
        }))
      }
    }

    let createRes: {
      idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }>
      catalogObject?: { id?: string | null } | null
    }
    try {
      createRes = await square.catalog.object.upsert({
        idempotencyKey: randomUUID(),
        object: subscriptionPlanObject
      } as never) as {
        idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }>
        catalogObject?: { id?: string | null } | null
      }
    } catch (error) {
      if (cleanupSquareItemId) {
        try {
          await square.catalog.object.delete({ objectId: cleanupSquareItemId } as never)
        } catch (deleteError) {
          void deleteError
        }
      }
      for (const discountId of createdDiscountIds) {
        try {
          await square.catalog.object.delete({ objectId: discountId } as never)
        } catch (deleteError) {
          void deleteError
        }
      }
      throw createError({
        statusCode: 502,
        statusMessage: `Square plan creation failed: ${extractSquareError(error)}`
      })
    }

    const idMappings = new Map<string, string>()
    for (const mapping of createRes.idMappings ?? []) {
      const clientId = mapping.clientObjectId ?? ''
      const objectId = mapping.objectId ?? ''
      if (clientId && objectId) idMappings.set(clientId, objectId)
    }

    squarePlanId = idMappings.get(planTempId) ?? createRes.catalogObject?.id ?? null
    if (!squarePlanId) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Could not resolve the created Square subscription plan ID.'
      })
    }

    for (const variation of enabledCadences) {
      const tempVariationId = tempVariationIds.get(variation.cadence)!
      const resolvedVariationId = idMappings.get(tempVariationId)
      if (!resolvedVariationId) {
        throw createError({
          statusCode: 500,
          statusMessage: `Could not resolve Square variation ID for ${variation.cadence}.`
        })
      }
      resolvedVariationIds.set(variation.cadence, resolvedVariationId)
    }
  } else {
    for (const variation of enabledCadences) {
      const tempOrExistingVariationId = variation.providerPlanVariationId || `#${body.tierId}_${variation.cadence}_${randomUUID().slice(0, 8)}`
      let upsertRes: {
        idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }>
        catalogObject?: { id?: string | null } | null
      }

      try {
        upsertRes = await square.catalog.object.upsert({
          idempotencyKey: randomUUID(),
          object: {
            id: tempOrExistingVariationId,
            type: 'SUBSCRIPTION_PLAN_VARIATION',
            presentAtAllLocations: true,
            subscriptionPlanVariationData: {
              name: `${body.displayName} ${cadenceLabel(variation.cadence)}`,
              subscriptionPlanId: squarePlanId,
              phases: [
                buildSquarePhase(
                  variation.cadence,
                  variation.priceCents,
                  variation.currency,
                  discountIdsByCadence.get(variation.cadence)
                    ? [discountIdsByCadence.get(variation.cadence)!]
                    : []
                )
              ]
            }
          }
        } as never) as {
          idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }>
          catalogObject?: { id?: string | null } | null
        }
      } catch (error) {
        const detail = extractSquareError(error)
        if (isImmutablePhaseError(detail)) {
          throw createError({
            statusCode: 400,
            statusMessage: `${cadenceLabel(variation.cadence)} variation is already locked in Square and cannot have phases replaced. Create a fresh Square variation for this cadence, or edit pricing in Square directly.`
          })
        }
        throw createError({
          statusCode: 502,
          statusMessage: `Square ${variation.cadence} sync failed: ${detail}`
        })
      }

      const mappedId = (upsertRes.idMappings ?? [])
        .find(item => item.clientObjectId === tempOrExistingVariationId)?.objectId
      const resolvedId = variation.providerPlanVariationId || mappedId || upsertRes.catalogObject?.id || null

      if (!resolvedId) {
        throw createError({
          statusCode: 500,
          statusMessage: `Could not resolve Square variation ID for ${variation.cadence}.`
        })
      }

      resolvedVariationIds.set(variation.cadence, resolvedId)
    }
  }

  const enabledVariationRows = enabledCadences.map((variation) => {
    const providerPlanVariationId = resolvedVariationIds.get(variation.cadence) ?? variation.providerPlanVariationId
    if (!providerPlanVariationId) {
      throw createError({
        statusCode: 500,
        statusMessage: `Missing provider_plan_variation_id for ${variation.cadence}.`
      })
    }

    return {
      tier_id: body.tierId,
      cadence: variation.cadence,
      provider: 'square',
      provider_plan_id: squarePlanId,
      provider_plan_variation_id: providerPlanVariationId,
      credits_per_month: variation.creditsPerMonth,
      price_cents: variation.priceCents,
      currency: variation.currency,
      discount_label: variation.discountLabel,
      active: true,
      visible: body.directAccessOnly ? false : variation.visible,
      sort_order: variation.sortOrder ?? cadenceSortOrder(variation.cadence)
    }
  })
  const disabledCadences = allCadences
    .filter(variation => !variation.enabled)
    .map(variation => variation.cadence)

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
    .upsert(enabledVariationRows, {
      onConflict: 'tier_id,cadence,provider'
    })

  if (variationErr) {
    if (variationErr.message.includes('membership_plan_variations_cadence_check')) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Database schema still allows only monthly/quarterly/annual cadences. Apply migration 20240022_membership_cadence_daily_weekly.sql and retry.'
      })
    }
    throw createError({ statusCode: 500, statusMessage: variationErr.message })
  }

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
    squareItemId,
    directAccessOnly: body.directAccessOnly,
    checkoutLinks: enabledCadences.map(variation => ({
      cadence: variation.cadence,
      url: `/checkout?tier=${encodeURIComponent(body.tierId)}&cadence=${variation.cadence}&returnTo=${encodeURIComponent('/dashboard/admin')}`
    })),
    variationIds: enabledVariationRows
      .map(row => ({
        cadence: row.cadence,
        providerPlanVariationId: row.provider_plan_variation_id
      }))
  }
})
