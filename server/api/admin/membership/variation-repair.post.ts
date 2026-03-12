import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getServerConfig } from '~~/server/utils/config/secret'
import { useSquareClient } from '~~/server/utils/square'
import { buildSubscriptionCreatePhasesFromPlanVariation } from '~~/server/utils/square/subscriptionPhases'

const cadenceSchema = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual'])

const bodySchema = z.object({
  tierId: z.string().min(1).optional(),
  cadence: cadenceSchema.optional(),
  force: z.boolean().default(false),
  dryRun: z.boolean().default(false)
})

type Cadence = z.infer<typeof cadenceSchema>

type VariationRow = {
  id: string
  tier_id: string
  cadence: Cadence
  provider_plan_id: string | null
  provider_plan_variation_id: string | null
  discount_label: string | null
  currency: string | null
  active: boolean
  membership_tiers?: {
    display_name?: string | null
  } | null
}

type DiscountShape = {
  type: 'percent' | 'dollar'
  amount: string
}

function cadenceToSquare(cadence: Cadence) {
  if (cadence === 'daily') return 'DAILY'
  if (cadence === 'weekly') return 'WEEKLY'
  if (cadence === 'quarterly') return 'QUARTERLY'
  if (cadence === 'annual') return 'ANNUAL'
  return 'MONTHLY'
}

function cadenceLabel(cadence: Cadence) {
  if (cadence === 'daily') return 'Daily'
  if (cadence === 'weekly') return 'Weekly'
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return 'Monthly'
}

function parseDiscountLabel(label: string | null | undefined): DiscountShape | null {
  const raw = (label ?? '').trim()
  if (!raw) return null

  const percentMatch = raw.match(/(-?\d+(?:\.\d+)?)\s*%/)
  if (percentMatch?.[1]) return { type: 'percent', amount: percentMatch[1] }

  const percentWordMatch = raw.match(/(-?\d+(?:\.\d+)?)\s*(?:percent|pct|off)?$/i)
  if (percentWordMatch?.[1] && !raw.includes('$')) {
    return { type: 'percent', amount: percentWordMatch[1] }
  }

  const dollarMatch = raw.match(/\$\s*(-?\d+(?:\.\d+)?)/)
  if (dollarMatch?.[1]) return { type: 'dollar', amount: dollarMatch[1] }
  return null
}

function normalizeSquareError(error: unknown) {
  if (error && typeof error === 'object') {
    const errors = (error as { errors?: unknown }).errors
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0]
      if (first && typeof first === 'object') {
        const detail = (first as { detail?: unknown }).detail
        if (typeof detail === 'string' && detail.trim()) return detail.trim()
      }
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return 'Square request failed'
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

async function createOrderTemplateForPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any,
  planId: string,
  locationId: string
) {
  const planRes = await square.catalog.object.get({
    objectId: planId,
    includeRelatedObjects: false
  } as never)
  const planObject = asRecord((planRes as { object?: unknown, catalogObject?: unknown }).object ?? (planRes as { catalogObject?: unknown }).catalogObject)
  const planData = asRecord(planObject?.subscriptionPlanData ?? planObject?.subscription_plan_data)
  const eligibleItemIds = Array.isArray(planData?.eligibleItemIds ?? planData?.eligible_item_ids)
    ? (planData?.eligibleItemIds ?? planData?.eligible_item_ids) as unknown[]
    : []
  const firstEligibleItemId = eligibleItemIds
    .map(item => typeof item === 'string' ? item.trim() : '')
    .find(Boolean)

  if (!firstEligibleItemId) {
    throw new Error(`Plan ${planId} has no eligible item IDs`)
  }

  const itemRes = await square.catalog.object.get({
    objectId: firstEligibleItemId,
    includeRelatedObjects: false
  } as never)
  const itemObject = asRecord((itemRes as { object?: unknown, catalogObject?: unknown }).object ?? (itemRes as { catalogObject?: unknown }).catalogObject)
  const itemData = asRecord(itemObject?.itemData ?? itemObject?.item_data)
  const rawVariations = Array.isArray(itemData?.variations) ? itemData.variations : []
  const firstVariation = rawVariations
    .map(entry => asRecord(entry))
    .find(Boolean) ?? null
  const itemVariationId = readString(firstVariation, 'id')
  if (!itemVariationId) {
    throw new Error(`Eligible item ${firstEligibleItemId} has no item variation ID`)
  }

  const orderRes = await square.orders.create({
    idempotencyKey: randomUUID(),
    order: {
      locationId,
      state: 'DRAFT',
      lineItems: [
        {
          catalogObjectId: itemVariationId,
          quantity: '1'
        }
      ]
    }
  } as never)
  const order = asRecord((orderRes as { order?: unknown }).order)
  const orderTemplateId = readString(order, 'id')
  if (!orderTemplateId) {
    throw new Error(`Could not create order template for plan ${planId}`)
  }
  return orderTemplateId
}

function isRelativePhaseMissingOrderTemplate(phases: unknown) {
  if (!Array.isArray(phases)) return false
  return phases.some((phase) => {
    if (!phase || typeof phase !== 'object') return false
    const phaseRecord = phase as Record<string, unknown>
    const pricing = phaseRecord.pricing
    const pricingType = pricing && typeof pricing === 'object'
      ? (pricing as Record<string, unknown>).type
      : null
    const normalizedPricingType = typeof pricingType === 'string' ? pricingType.toUpperCase() : null
    const orderTemplateId = phaseRecord.orderTemplateId
    const hasOrderTemplateId = typeof orderTemplateId === 'string' && orderTemplateId.trim().length > 0
    return normalizedPricingType === 'RELATIVE' && !hasOrderTemplateId
  })
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))
  const square = await useSquareClient(event)
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
  if (!locationId) {
    throw createError({ statusCode: 503, statusMessage: 'Missing SQUARE_STUDIO_LOCATION_ID' })
  }

  let query = supabase
    .from('membership_plan_variations')
    .select('id,tier_id,cadence,provider_plan_id,provider_plan_variation_id,discount_label,currency,active,membership_tiers!inner(display_name)')
    .eq('provider', 'square')
    .eq('active', true)
    .order('tier_id', { ascending: true })

  if (body.tierId) query = query.eq('tier_id', body.tierId)
  if (body.cadence) query = query.eq('cadence', body.cadence)

  const { data: variationRows, error: variationErr } = await query
  if (variationErr) throw createError({ statusCode: 500, statusMessage: variationErr.message })

  const rows = (variationRows ?? []) as VariationRow[]
  if (rows.length === 0) {
    return {
      ok: true,
      dryRun: body.dryRun,
      total: 0,
      repaired: 0,
      skipped: 0,
      failed: 0,
      items: [] as Array<Record<string, unknown>>
    }
  }

  const results: Array<Record<string, unknown>> = []
  let repaired = 0
  let skipped = 0
  let failed = 0
  const orderTemplateIdByPlanId = new Map<string, string>()

  for (const row of rows) {
    const tierName = row.membership_tiers?.display_name ?? row.tier_id
    const baseResult = {
      tierId: row.tier_id,
      tierName,
      cadence: row.cadence,
      oldVariationId: row.provider_plan_variation_id
    }

    if (!row.provider_plan_id || !row.provider_plan_variation_id) {
      skipped += 1
      results.push({ ...baseResult, status: 'skipped', reason: 'missing_plan_mapping' })
      continue
    }

    let broken = false
    try {
      const phases = await buildSubscriptionCreatePhasesFromPlanVariation(square, row.provider_plan_variation_id)
      broken = isRelativePhaseMissingOrderTemplate(phases)
    } catch {
      broken = false
    }

    if (!broken && !body.force) {
      skipped += 1
      results.push({ ...baseResult, status: 'skipped', reason: 'not_broken' })
      continue
    }

    const discount = parseDiscountLabel(row.discount_label)
    let discountId: string | null = null

    if (!body.dryRun && discount) {
      const amount = Number(discount.amount)
      if (Number.isFinite(amount) && amount >= 0) {
        const normalizedAmount = Number.isInteger(amount) ? String(amount) : Number(amount.toFixed(2)).toString()
        const discountTempId = `#repair_${row.tier_id}_${row.cadence}_discount_${randomUUID().slice(0, 8)}`
        const discountObject = discount.type === 'percent'
          ? {
              id: discountTempId,
              type: 'DISCOUNT' as const,
              discountData: {
                name: `${tierName} - ${cadenceLabel(row.cadence)} ${normalizedAmount}%`,
                discountType: 'FIXED_PERCENTAGE' as const,
                percentage: normalizedAmount
              }
            }
          : {
              id: discountTempId,
              type: 'DISCOUNT' as const,
              discountData: {
                name: `${tierName} - ${cadenceLabel(row.cadence)} $${normalizedAmount}`,
                discountType: 'FIXED_AMOUNT' as const,
                amountMoney: {
                  amount: BigInt(Math.round(amount * 100)),
                  currency: (row.currency || 'USD').toUpperCase()
                }
              }
            }

        try {
          const discountRes = await square.catalog.object.upsert({
            idempotencyKey: randomUUID(),
            object: discountObject
          } as never) as {
            idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }>
            catalogObject?: { id?: string | null } | null
          }

          discountId = (
            discountRes.idMappings?.find(mapping => mapping.clientObjectId === discountTempId)?.objectId
            ?? discountRes.catalogObject?.id
            ?? null
          )
        } catch (error) {
          failed += 1
          results.push({
            ...baseResult,
            status: 'failed',
            reason: 'discount_create_failed',
            message: normalizeSquareError(error)
          })
          continue
        }
      }
    }

    const variationTempId = `#repair_${row.tier_id}_${row.cadence}_${randomUUID().slice(0, 8)}`
    let orderTemplateId: string | null = null
    if (!body.dryRun) {
      if (orderTemplateIdByPlanId.has(row.provider_plan_id)) {
        orderTemplateId = orderTemplateIdByPlanId.get(row.provider_plan_id) ?? null
      } else {
        try {
          orderTemplateId = await createOrderTemplateForPlan(square, row.provider_plan_id, locationId)
          orderTemplateIdByPlanId.set(row.provider_plan_id, orderTemplateId)
        } catch (error) {
          failed += 1
          results.push({
            ...baseResult,
            status: 'failed',
            reason: 'order_template_create_failed',
            message: normalizeSquareError(error)
          })
          continue
        }
      }
    }

    const phase = {
      cadence: cadenceToSquare(row.cadence),
      ...(orderTemplateId ? { orderTemplateId } : {}),
      pricing: discountId
        ? { type: 'RELATIVE' as const, discountIds: [discountId] }
        : { type: 'RELATIVE' as const }
    }

    if (body.dryRun) {
      repaired += 1
      results.push({
        ...baseResult,
        status: 'would_repair',
        newVariationId: variationTempId
      })
      continue
    }

    try {
      const upsertRes = await square.catalog.object.upsert({
        idempotencyKey: randomUUID(),
        object: {
          id: variationTempId,
          type: 'SUBSCRIPTION_PLAN_VARIATION',
          presentAtAllLocations: true,
          subscriptionPlanVariationData: {
            name: `${tierName} ${cadenceLabel(row.cadence)}`,
            subscriptionPlanId: row.provider_plan_id,
            phases: [phase]
          }
        }
      } as never) as {
        idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }>
        catalogObject?: { id?: string | null } | null
      }

      const newVariationId = (
        upsertRes.idMappings?.find(mapping => mapping.clientObjectId === variationTempId)?.objectId
        ?? upsertRes.catalogObject?.id
        ?? null
      )

      if (!newVariationId) {
        failed += 1
        results.push({
          ...baseResult,
          status: 'failed',
          reason: 'variation_id_unresolved'
        })
        continue
      }

      const { error: updateErr } = await supabase
        .from('membership_plan_variations')
        .update({ provider_plan_variation_id: newVariationId })
        .eq('id', row.id)

      if (updateErr) {
        failed += 1
        results.push({
          ...baseResult,
          status: 'failed',
          reason: 'db_update_failed',
          message: updateErr.message
        })
        continue
      }

      repaired += 1
      results.push({
        ...baseResult,
        status: 'repaired',
        newVariationId
      })
    } catch (error) {
      failed += 1
      results.push({
        ...baseResult,
        status: 'failed',
        reason: 'variation_create_failed',
        message: normalizeSquareError(error)
      })
    }
  }

  return {
    ok: true,
    dryRun: body.dryRun,
    force: body.force,
    total: rows.length,
    repaired,
    skipped,
    failed,
    items: results
  }
})
