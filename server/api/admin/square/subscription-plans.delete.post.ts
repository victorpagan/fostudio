import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

const bodySchema = z.object({
  planIds: z.array(z.string().min(4)).min(1).max(100)
})

type SquareCatalogObject = {
  id?: string
  type?: string
  version?: unknown
  presentAtAllLocations?: boolean
  present_at_all_locations?: boolean
  itemData?: Record<string, unknown>
  item_data?: Record<string, unknown>
  subscriptionPlanData?: {
    subscriptionPlanVariations?: Array<{ id?: string }>
    subscription_plan_variations?: Array<{ id?: string }>
  }
  subscription_plan_data?: {
    subscriptionPlanVariations?: Array<{ id?: string }>
    subscription_plan_variations?: Array<{ id?: string }>
  }
}

function readSquareObject(response: unknown): SquareCatalogObject | null {
  if (!response || typeof response !== 'object') return null
  const payload = response as {
    object?: unknown
    body?: { object?: unknown }
    result?: { object?: unknown }
  }
  const object = payload.object ?? payload.body?.object ?? payload.result?.object ?? null
  if (!object || typeof object !== 'object') return null
  return object as SquareCatalogObject
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const bodyIndex = error.message.indexOf('Body:')
    if (bodyIndex >= 0) {
      const jsonPart = error.message.slice(bodyIndex + 5).trim()
      try {
        const parsed = JSON.parse(jsonPart) as { errors?: Array<{ detail?: string }> }
        const detail = parsed.errors?.[0]?.detail
        if (typeof detail === 'string' && detail.trim()) return detail
      } catch {
        // ignore JSON parse failures
      }
    }
    return error.message
  }
  return 'Unknown Square error'
}

function isNotFound(error: unknown): boolean {
  const message = readErrorMessage(error).toLowerCase()
  return message.includes('not found') || message.includes('already deleted')
}

function readPlanVariationIds(planObject: SquareCatalogObject | null): string[] {
  if (!planObject) return []
  const planData = planObject.subscriptionPlanData ?? planObject.subscription_plan_data
  const entries = planData?.subscriptionPlanVariations ?? planData?.subscription_plan_variations ?? []
  if (!Array.isArray(entries)) return []
  return entries
    .map(row => typeof row?.id === 'string' ? row.id.trim() : '')
    .filter((value): value is string => value.length > 0)
}

function toSquareVersion(value: unknown) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  return undefined
}

function buildSquareDeactivateObject(squareObject: SquareCatalogObject | null) {
  if (!squareObject || typeof squareObject !== 'object') return null
  const id = typeof squareObject.id === 'string' ? squareObject.id.trim() : ''
  const type = typeof squareObject.type === 'string' ? squareObject.type.trim() : ''
  if (!id || !type) return null

  const payload: Record<string, unknown> = { id, type }
  const version = toSquareVersion(squareObject.version)
  if (version !== undefined) payload.version = version

  if (type === 'ITEM') {
    const itemData = squareObject.itemData ?? squareObject.item_data
    if (!itemData) return null
    payload.itemData = { ...itemData, isArchived: true }
    return payload
  }

  payload.presentAtAllLocations = false

  if (type === 'SUBSCRIPTION_PLAN') {
    const planData = squareObject.subscriptionPlanData ?? squareObject.subscription_plan_data
    if (planData) payload.subscriptionPlanData = planData
  }

  if (type === 'SUBSCRIPTION_PLAN_VARIATION') {
    payload.subscriptionPlanVariationData = (squareObject as unknown as {
      subscriptionPlanVariationData?: Record<string, unknown>
      subscription_plan_variation_data?: Record<string, unknown>
    }).subscriptionPlanVariationData
    ?? (squareObject as unknown as {
      subscription_plan_variation_data?: Record<string, unknown>
    }).subscription_plan_variation_data
  }

  return payload
}

async function deactivateObjectById(square: Awaited<ReturnType<typeof useSquareClient>>, objectId: string) {
  const getRes = await square.catalog.object.get({ objectId, includeRelatedObjects: false } as never)
  const object = readSquareObject(getRes)
  if (!object) {
    return { ok: false as const, reason: 'Object not found' }
  }
  const payload = buildSquareDeactivateObject(object)
  if (!payload) {
    return { ok: false as const, reason: 'Object shape not supported for deactivation' }
  }
  await square.catalog.object.upsert({
    idempotencyKey: randomUUID(),
    object: payload
  } as never)
  return { ok: true as const }
}

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))
  const square = await useSquareClient(event)

  const results: Array<{
    planId: string
    ok: boolean
    deactivatedVariations: string[]
    blockedVariations: Array<{ variationId: string, reason: string }>
    planDeactivated: boolean
    error?: string
  }> = []

  for (const planId of body.planIds) {
    const deactivatedVariations: string[] = []
    const blockedVariations: Array<{ variationId: string, reason: string }> = []
    let planDeactivated = false
    try {
      const getRes = await square.catalog.object.get({ objectId: planId, includeRelatedObjects: false } as never)
      const variationIds = readPlanVariationIds(readSquareObject(getRes))

      for (const variationId of variationIds) {
        try {
          const variationResult = await deactivateObjectById(square, variationId)
          if (variationResult.ok) {
            deactivatedVariations.push(variationId)
          } else {
            blockedVariations.push({ variationId, reason: variationResult.reason })
          }
        } catch (variationError) {
          if (!isNotFound(variationError)) {
            const reason = readErrorMessage(variationError)
            blockedVariations.push({ variationId, reason })
          }
        }
      }

      try {
        const planResult = await deactivateObjectById(square, planId)
        if (planResult.ok) {
          planDeactivated = true
        } else {
          throw new Error(planResult.reason)
        }
      } catch (planError) {
        if (isNotFound(planError)) {
          planDeactivated = true
        } else {
          const planReason = readErrorMessage(planError)
          const blockedSummary = blockedVariations.length > 0
            ? ` Blocked variations: ${blockedVariations.map(row => row.variationId).join(', ')}.`
            : ''
          throw new Error(`${planReason}.${blockedSummary}`)
        }
      }

      results.push({ planId, ok: true, deactivatedVariations, blockedVariations, planDeactivated })
    } catch (error) {
      results.push({
        planId,
        ok: false,
        deactivatedVariations,
        blockedVariations,
        planDeactivated,
        error: readErrorMessage(error)
      })
    }
  }

  const deactivated = results.filter(row => row.ok).length
  const failed = results.length - deactivated

  return {
    ok: failed === 0,
    deactivated,
    failed,
    results
  }
})
