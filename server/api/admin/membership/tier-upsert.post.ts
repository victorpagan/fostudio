import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { inviteWaitlistForTier } from '~~/server/utils/membership/waitlist'
import { useSquareClient } from '~~/server/utils/square'

const variationSchema = z.object({
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']),
  provider: z.literal('square').default('square'),
  providerPlanId: z.string().optional().nullable(),
  providerPlanVariationId: z.string().optional().nullable(),
  creditsPerMonth: z.number().min(0),
  priceCents: z.number().int().min(0),
  currency: z.string().default('USD'),
  discountLabel: z.string().max(64).optional().nullable(),
  active: z.boolean().default(true),
  visible: z.boolean().default(true),
  sortOrder: z.number().int().default(0)
})

const bodySchema = z.object({
  id: z.string().min(2).max(48).regex(/^[a-z][a-z0-9_]*$/),
  displayName: z.string().min(2).max(80),
  description: z.string().max(240).optional().nullable(),
  bookingWindowDays: z.number().int().min(1).max(365),
  peakMultiplier: z.number().min(1).max(4),
  maxBank: z.number().int().min(0).max(10000),
  creditExpiryDays: z.number().int().min(1).max(3650).default(90),
  topoffCreditExpiryDays: z.number().int().min(1).max(3650).default(30),
  maxSlots: z.number().int().min(0).max(10000).optional().nullable().default(10),
  holdsIncluded: z.number().int().min(0).max(50),
  active: z.boolean().default(true),
  visible: z.boolean().default(true),
  directAccessOnly: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  variations: z.array(variationSchema).min(1)
})

type SquareLooseObject = Record<string, unknown>

function extractSquareObject(response: unknown) {
  if (!response || typeof response !== 'object') return null
  const responseObject = response as {
    object?: unknown
    body?: { object?: unknown }
    result?: { object?: unknown }
    data?: { object?: unknown }
  }
  return (
    responseObject.object
    ?? responseObject.body?.object
    ?? responseObject.result?.object
    ?? responseObject.data?.object
    ?? null
  )
}

function toSquareVersion(value: unknown) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  return undefined
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter((item): item is string => item.length > 0)
}

function extractPlanEligibleItemIds(squareObject: unknown) {
  if (!squareObject || typeof squareObject !== 'object') return [] as string[]
  const objectValue = squareObject as {
    type?: string
    subscriptionPlanData?: { eligibleItemIds?: unknown }
    subscription_plan_data?: { eligibleItemIds?: unknown, eligible_item_ids?: unknown }
  }
  if (objectValue.type !== 'SUBSCRIPTION_PLAN') return []

  const planData = objectValue.subscriptionPlanData ?? objectValue.subscription_plan_data
  const rawIds = planData?.eligibleItemIds ?? planData?.eligible_item_ids
  return toStringArray(rawIds)
}

function normalizeTierItemObject(
  sourceObject: SquareLooseObject,
  displayName: string,
  priceCents: number,
  currency: string
) {
  const itemData = (sourceObject.itemData ?? sourceObject.item_data) as SquareLooseObject | undefined
  if (!itemData) return null

  const rawVariations = (itemData.variations as unknown[] | undefined) ?? []
  if (!Array.isArray(rawVariations) || rawVariations.length === 0) return null

  const updatedVariations = rawVariations.map((variation) => {
    if (!variation || typeof variation !== 'object') return variation
    const variationValue = variation as SquareLooseObject
    const variationData = (variationValue.itemVariationData ?? variationValue.item_variation_data) as SquareLooseObject | undefined
    if (!variationData) return variation
    return {
      ...variationValue,
      itemVariationData: {
        ...variationData,
        pricingType: 'FIXED_PRICING',
        priceMoney: {
          amount: BigInt(priceCents),
          currency
        }
      }
    }
  })

  const payload: SquareLooseObject = {
    id: sourceObject.id,
    type: 'ITEM',
    itemData: {
      ...itemData,
      name: itemData.name ?? `${displayName} membership`,
      productType: 'REGULAR',
      isTaxable: false,
      variations: updatedVariations
    }
  }

  const version = toSquareVersion(sourceObject.version)
  if (version !== undefined) payload.version = version
  return payload
}

function cadenceSortOrder(cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual') {
  if (cadence === 'daily') return 1
  if (cadence === 'weekly') return 2
  if (cadence === 'monthly') return 3
  if (cadence === 'quarterly') return 4
  if (cadence === 'annual') return 5
  return 6
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))
  const cadenceOrder = ['daily', 'weekly', 'monthly', 'quarterly', 'annual'] as const
  const enabledVariations = body.variations.filter(variation => variation.active)

  if (enabledVariations.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Enable at least one billing cadence.' })
  }

  const missingPlanLink = enabledVariations.find((variation) => {
    const planId = variation.providerPlanId?.trim()
    const variationId = variation.providerPlanVariationId?.trim()
    return !planId || !variationId
  })
  if (missingPlanLink) {
    throw createError({
      statusCode: 400,
      statusMessage: `Missing Square plan link for ${missingPlanLink.cadence}. Provide both plan ID and variation ID.`
    })
  }

  const knownPlanIds = new Set(
    enabledVariations
      .map(variation => variation.providerPlanId?.trim())
      .filter((id): id is string => Boolean(id))
  )
  if (knownPlanIds.size > 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Enabled cadences must share the same Square plan ID.'
    })
  }

  const sharedPlanId = Array.from(knownPlanIds)[0] ?? null
  const basePriceVariation = [...enabledVariations]
    .sort((a, b) => cadenceSortOrder(a.cadence) - cadenceSortOrder(b.cadence))
    .find(variation => variation.cadence === 'monthly')
    ?? [...enabledVariations].sort((a, b) => cadenceSortOrder(a.cadence) - cadenceSortOrder(b.cadence))[0]

  if (sharedPlanId && basePriceVariation) {
    try {
      const square = await useSquareClient(event)
      const planRes = await square.catalog.object.get({
        objectId: sharedPlanId,
        includeRelatedObjects: false
      } as never)
      const planObject = extractSquareObject(planRes)
      const eligibleItemIds = extractPlanEligibleItemIds(planObject)

      for (const itemId of eligibleItemIds) {
        const itemRes = await square.catalog.object.get({
          objectId: itemId,
          includeRelatedObjects: false
        } as never)
        const itemObject = extractSquareObject(itemRes) as SquareLooseObject | null
        if (!itemObject) continue

        const normalizedObject = normalizeTierItemObject(
          itemObject,
          body.displayName,
          basePriceVariation.priceCents,
          basePriceVariation.currency.toUpperCase()
        )
        if (!normalizedObject) continue

        await square.catalog.object.upsert({
          idempotencyKey: randomUUID(),
          object: normalizedObject
        } as never)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw createError({
        statusCode: 502,
        statusMessage: `Failed to sync Square base item price/type: ${message}`
      })
    }
  }

  const tierRow = {
    id: body.id,
    display_name: body.displayName,
    description: body.description ?? null,
    booking_window_days: body.bookingWindowDays,
    peak_multiplier: body.peakMultiplier,
    max_bank: body.maxBank,
    credit_expiry_days: body.creditExpiryDays,
    topoff_credit_expiry_days: body.topoffCreditExpiryDays,
    max_slots: body.maxSlots ?? null,
    holds_included: body.holdsIncluded,
    active: body.active,
    visible: body.directAccessOnly ? false : body.visible,
    direct_access_only: body.directAccessOnly,
    sort_order: body.sortOrder
  }

  const { error: tierErr } = await supabase
    .from('membership_tiers')
    .upsert(tierRow, { onConflict: 'id' })

  if (tierErr) {
    const rawMessage = tierErr.message ?? ''
    if (/credit_expiry_days|topoff_credit_expiry_days/i.test(rawMessage)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Database schema is missing per-tier credit expiry columns. Apply migration 20240030_membership_credit_expiry_and_cap_split.sql and retry.'
      })
    }
    throw createError({ statusCode: 500, statusMessage: tierErr.message })
  }

  const variationRows = enabledVariations.map((variation) => {
    return {
      tier_id: body.id,
      cadence: variation.cadence,
      provider: variation.provider,
      provider_plan_id: variation.providerPlanId?.trim() ?? null,
      provider_plan_variation_id: variation.providerPlanVariationId?.trim() ?? null,
      credits_per_month: variation.creditsPerMonth,
      price_cents: variation.priceCents,
      currency: variation.currency.toUpperCase(),
      discount_label: variation.discountLabel?.trim() || null,
      active: true,
      visible: body.directAccessOnly ? false : variation.visible,
      sort_order: variation.sortOrder
    }
  })

  const { error: variationErr } = await supabase
    .from('membership_plan_variations')
    .upsert(variationRows, { onConflict: 'tier_id,cadence,provider' })

  if (variationErr) throw createError({ statusCode: 500, statusMessage: variationErr.message })

  const disabledCadences = cadenceOrder.filter(
    cadence => !enabledVariations.some(variation => variation.cadence === cadence)
  )

  if (disabledCadences.length > 0) {
    const { error: disableErr } = await supabase
      .from('membership_plan_variations')
      .update({ active: false, visible: false })
      .eq('tier_id', body.id)
      .eq('provider', 'square')
      .in('cadence', disabledCadences)

    if (disableErr) throw createError({ statusCode: 500, statusMessage: disableErr.message })
  }

  await inviteWaitlistForTier(event, body.id).catch((error) => {
    console.warn('[admin/membership/tier-upsert] waitlist invite pass failed', {
      tierId: body.id,
      message: error instanceof Error ? error.message : String(error)
    })
  })

  return {
    ok: true,
    tierId: body.id,
    squarePlanId: sharedPlanId,
    linkedCadences: enabledVariations.map(variation => variation.cadence)
  }
})
