import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

const bodySchema = z.object({
  tierId: z
    .string()
    .min(2)
    .max(48)
    .regex(/^[a-z][a-z0-9_]*$/, 'tierId must be lowercase snake_case')
})

function readSquareErrorList(error: unknown) {
  if (!error || typeof error !== 'object') return [] as Array<{ code?: string, category?: string, detail?: string }>
  const bodyLike = error as {
    errors?: Array<{ code?: string, category?: string, detail?: string }>
    body?: { errors?: Array<{ code?: string, category?: string, detail?: string }> }
    detail?: string
  }
  const messageErrors = bodyLike.errors ?? bodyLike.body?.errors ?? []
  if (messageErrors.length) return messageErrors
  if (typeof bodyLike.detail === 'string' && bodyLike.detail.trim()) {
    return [{ detail: bodyLike.detail }]
  }
  return []
}

function isSquareNotFoundError(error: unknown, message: string) {
  const errors = readSquareErrorList(error)
  const lowerMessage = message.toLowerCase()
  return errors.some(item => item?.code === 'NOT_FOUND')
    || lowerMessage.includes('not found')
    || lowerMessage.includes('does not exist')
    || lowerMessage.includes('already deleted')
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

function extractSquareErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return parseSquareErrorDetailFromMessage(error.message) ?? error.message
  }
  return 'Square update failed'
}

function isSchemaMissingColumnError(message: string) {
  return /column .* does not exist/i.test(message) || /relation .* does not exist/i.test(message)
}

function shouldIgnoreMembershipLookupError(message: string) {
  return /invalid input value for enum/i.test(message) || /does not exist/i.test(message) || isSchemaMissingColumnError(message)
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter((item): item is string => item.length > 0)
}

function extractSquarePlanItemIds(squareObject: unknown) {
  if (!squareObject || typeof squareObject !== 'object') return [] as string[]
  const objectValue = squareObject as {
    type?: string
    subscriptionPlanData?: { eligibleItemIds?: unknown }
    subscription_plan_data?: { eligibleItemIds?: unknown, eligible_item_ids?: unknown }
  }
  if (objectValue.type !== 'SUBSCRIPTION_PLAN') return []

  const subscriptionPlanData = objectValue.subscriptionPlanData ?? objectValue.subscription_plan_data
  const rawIds = subscriptionPlanData?.eligibleItemIds ?? subscriptionPlanData?.eligible_item_ids
  return toStringArray(rawIds)
}

function extractSquarePlanVariationIds(squareObject: unknown) {
  if (!squareObject || typeof squareObject !== 'object') return [] as string[]
  const objectValue = squareObject as {
    type?: string
    subscriptionPlanData?: { subscriptionPlanVariations?: unknown[], subscription_plan_variations?: unknown[] }
    subscription_plan_data?: { subscriptionPlanVariations?: unknown[], subscription_plan_variations?: unknown[] }
  }
  const subscriptionPlanData = objectValue.subscriptionPlanData ?? objectValue.subscription_plan_data
  const rawVariations = subscriptionPlanData?.subscriptionPlanVariations ?? subscriptionPlanData?.subscription_plan_variations
  if (!Array.isArray(rawVariations)) return []

  return rawVariations
    .map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return ''
      const variation = entry as { id?: unknown }
      return typeof variation.id === 'string' ? variation.id.trim() : ''
    })
    .filter((value): value is string => value.length > 0)
}

function extractSquareVariationPlanId(squareObject: unknown) {
  if (!squareObject || typeof squareObject !== 'object') return ''
  const objectValue = squareObject as {
    type?: string
    subscriptionPlanVariationData?: { subscriptionPlanId?: unknown }
    subscription_plan_variation_data?: { subscription_plan_id?: unknown }
  }
  if (objectValue.type !== 'SUBSCRIPTION_PLAN_VARIATION') return ''

  const variationData = objectValue.subscriptionPlanVariationData ?? objectValue.subscription_plan_variation_data
  const value = (variationData as { subscriptionPlanId?: unknown } | { subscription_plan_id?: unknown } | undefined)?.subscriptionPlanId
    ?? (variationData as { subscription_plan_id?: unknown })?.subscription_plan_id
  return typeof value === 'string' ? value.trim() : ''
}

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

async function loadSquareObject(
  square: Awaited<ReturnType<typeof useSquareClient>>,
  objectId: string
) {
  try {
    const response = await square.catalog.object.get({ objectId, includeRelatedObjects: false } as never)
    return extractSquareObject(response)
  } catch {
    return null
  }
}

function toSquareVersion(value: unknown) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  return undefined
}

function buildSquareDeactivateObject(squareObject: unknown) {
  if (!squareObject || typeof squareObject !== 'object') return null
  const objectValue = squareObject as {
    id?: unknown
    type?: unknown
    version?: unknown
    itemData?: Record<string, unknown>
    item_data?: Record<string, unknown>
    subscriptionPlanData?: Record<string, unknown>
    subscription_plan_data?: Record<string, unknown>
    subscriptionPlanVariationData?: Record<string, unknown>
    subscription_plan_variation_data?: Record<string, unknown>
  }

  const id = typeof objectValue.id === 'string' ? objectValue.id.trim() : ''
  const type = typeof objectValue.type === 'string' ? objectValue.type.trim() : ''
  if (!id || !type) return null

  const payload: Record<string, unknown> = { id, type }
  const version = toSquareVersion(objectValue.version)
  if (version !== undefined) payload.version = version

  if (type === 'ITEM') {
    const itemData = objectValue.itemData ?? objectValue.item_data
    if (!itemData) return null
    payload.itemData = { ...itemData, isArchived: true }
    return payload
  }

  payload.presentAtAllLocations = false

  if (type === 'SUBSCRIPTION_PLAN') {
    const planData = objectValue.subscriptionPlanData ?? objectValue.subscription_plan_data
    if (planData) payload.subscriptionPlanData = planData
    return payload
  }

  if (type === 'SUBSCRIPTION_PLAN_VARIATION') {
    const variationData = objectValue.subscriptionPlanVariationData ?? objectValue.subscription_plan_variation_data
    if (variationData) payload.subscriptionPlanVariationData = variationData
    return payload
  }

  return null
}

async function deactivateSquareObject(
  square: Awaited<ReturnType<typeof useSquareClient>>,
  objectId: string
) {
  const squareObject = await loadSquareObject(square, objectId)
  if (!squareObject) return { ok: false as const, reason: 'Object not found' }

  const deactivatedObject = buildSquareDeactivateObject(squareObject)
  if (!deactivatedObject) return { ok: false as const, reason: 'Object shape not supported for deactivation' }

  await square.catalog.object.upsert({
    idempotencyKey: randomUUID(),
    object: deactivatedObject
  } as never)

  return { ok: true as const }
}

async function loadSquareItemIdsFromPlanIds(
  square: Awaited<ReturnType<typeof useSquareClient>>,
  squarePlanIds: string[]
) {
  const squareItemIds = new Set<string>()

  for (const planId of squarePlanIds) {
    const planRes = await loadSquareObject(square, planId)
    if (!planRes) {
      continue
    }
    for (const itemId of extractSquarePlanItemIds(planRes)) {
      squareItemIds.add(itemId)
    }
  }

  return squareItemIds
}

async function loadPlanAndVariationIdsFromSquare(
  square: Awaited<ReturnType<typeof useSquareClient>>,
  variationIds: string[],
  squareWarnings: string[]
) {
  const discoveredPlanIds = new Set<string>()
  const discoveredVariationIds = new Set<string>()

  for (const variationId of variationIds) {
    const variationRes = await loadSquareObject(square, variationId)
    if (!variationRes) continue

    const planId = extractSquareVariationPlanId(variationRes)
    if (planId) {
      discoveredPlanIds.add(planId)
    } else {
      const rawId = (variationRes as { id?: unknown }).id
      const id = typeof rawId === 'string' ? rawId.trim() : ''
      if (id) {
        squareWarnings.push(`Square variation ${id} does not expose a plan id`)
      }
    }
  }

  for (const planId of Array.from(discoveredPlanIds)) {
    const planRes = await loadSquareObject(square, planId)
    if (!planRes) continue
    for (const variationId of extractSquarePlanVariationIds(planRes)) {
      discoveredVariationIds.add(variationId)
    }
  }

  return {
    planIds: Array.from(discoveredPlanIds),
    variationIds: Array.from(discoveredVariationIds)
  }
}

function uniqueStringValues(items: Array<string | null | undefined>) {
  return Array.from(new Set(items.filter((value): value is string => Boolean(value?.trim())).map(value => value!.trim())))
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))
  const squareWarnings: string[] = []

  const [{ data: tier, error: tierErr }, initialVariationRes] = await Promise.all([
    supabase
      .from('membership_tiers')
      .select('id')
      .eq('id', body.tierId)
      .maybeSingle(),
    supabase
      .from('membership_plan_variations')
      .select('cadence,provider_plan_id,provider_plan_variation_id')
      .eq('tier_id', body.tierId)
      .eq('provider', 'square')
  ])

  const variationRes = initialVariationRes.error && isSchemaMissingColumnError(initialVariationRes.error.message)
    ? await supabase
        .from('membership_plan_variations')
        .select('cadence,provider_plan_id,provider_plan_variation_id')
        .eq('tier_id', body.tierId)
    : initialVariationRes

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })
  if (variationRes.error) throw createError({ statusCode: 500, statusMessage: variationRes.error.message })
  if (!tier) throw createError({ statusCode: 404, statusMessage: 'Tier not found' })

  const square = await useSquareClient(event)
  const variations = variationRes.data ?? []

  let variationIds = uniqueStringValues(
    variations.map((row: { provider_plan_variation_id?: string | null }) => row.provider_plan_variation_id)
  )

  let planIds = uniqueStringValues(
    variations.map((row: { provider_plan_id?: string | null }) => row.provider_plan_id)
  )

  const discovered = await loadPlanAndVariationIdsFromSquare(square, variationIds, squareWarnings)
  planIds = uniqueStringValues([...planIds, ...discovered.planIds])
  variationIds = uniqueStringValues([...variationIds, ...discovered.variationIds])

  const squareItemIds = await loadSquareItemIdsFromPlanIds(square, planIds)

  for (const variationId of variationIds) {
    try {
      const result = await deactivateSquareObject(square, variationId)
      if (!result.ok) {
        squareWarnings.push(`Square variation ${variationId} was not deactivated: ${result.reason}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Square delete failed'
      if (!isSquareNotFoundError(error, message)) {
        const detail = extractSquareErrorMessage(error)
        squareWarnings.push(`Square variation ${variationId} was not deactivated: ${detail}`)
      }
    }
  }

  for (const planId of planIds) {
    try {
      const result = await deactivateSquareObject(square, planId)
      if (!result.ok) {
        squareWarnings.push(`Square plan ${planId} was not deactivated: ${result.reason}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Square delete failed'
      const detail = extractSquareErrorMessage(error)
      if (isSquareNotFoundError(error, message)) {
        continue
      }

      const object = await loadSquareObject(square, planId)
      const remainingVariationIds = extractSquarePlanVariationIds(object)
      if (remainingVariationIds.length > 0) {
        for (const remainingVariationId of remainingVariationIds) {
          try {
            const remainingResult = await deactivateSquareObject(square, remainingVariationId)
            if (!remainingResult.ok) {
              squareWarnings.push(`Square variation ${remainingVariationId} was not deactivated while cleaning plan ${planId}: ${remainingResult.reason}`)
            }
          } catch (removeVariationError) {
            const removeVariationMessage = removeVariationError instanceof Error ? removeVariationError.message : 'Square delete failed'
            if (!isSquareNotFoundError(removeVariationError, removeVariationMessage)) {
              squareWarnings.push(`Square variation ${remainingVariationId} was not deactivated while cleaning plan ${planId}: ${extractSquareErrorMessage(removeVariationError)}`)
            }
          }
        }

        try {
          const retryResult = await deactivateSquareObject(square, planId)
          if (!retryResult.ok) {
            squareWarnings.push(`Square plan ${planId} was not deactivated after retry: ${retryResult.reason}`)
          }
          continue
        } catch (retryPlanError) {
          const retryMessage = retryPlanError instanceof Error ? retryPlanError.message : 'Square delete failed'
          if (!isSquareNotFoundError(retryPlanError, retryMessage)) {
            squareWarnings.push(`Square plan ${planId} was not deactivated after retry: ${extractSquareErrorMessage(retryPlanError)}`)
          }
        }
      }

      squareWarnings.push(`Square plan ${planId} was not deactivated: ${detail}`)
    }
  }

  for (const squareItemId of squareItemIds) {
    try {
      const result = await deactivateSquareObject(square, squareItemId)
      if (!result.ok) {
        squareWarnings.push(`Square base item ${squareItemId} was not archived: ${result.reason}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Square delete failed'
      if (!isSquareNotFoundError(error, message)) {
        const detail = extractSquareErrorMessage(error)
        squareWarnings.push(`Square base item ${squareItemId} was not archived: ${detail}`)
      }
    }
  }

  let membershipsCount = 0
  const membershipsRes = await supabase
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('tier', body.tierId as never)

  if (membershipsRes.error) {
    const message = membershipsRes.error.message || ''
    // Legacy schemas may still use an enum for memberships.tier; querying a non-enum
    // tier value throws "invalid input value for enum ...". Treat as zero history.
    if (!shouldIgnoreMembershipLookupError(message)) {
      throw createError({ statusCode: 500, statusMessage: membershipsRes.error.message })
    }
    squareWarnings.push(`Could not verify membership history: ${message}`)
  } else {
    membershipsCount = Number(membershipsRes.count ?? 0)
  }

  let checkoutCount = 0
  const checkoutRes = await supabase
    .from('membership_checkout_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('tier', body.tierId)

  if (checkoutRes.error) {
    const message = checkoutRes.error.message || ''
    if (!shouldIgnoreMembershipLookupError(message)) {
      throw createError({ statusCode: 500, statusMessage: checkoutRes.error.message })
    }
    squareWarnings.push(`Could not verify checkout history: ${message}`)
  } else {
    checkoutCount = Number(checkoutRes.count ?? 0)
  }

  const hasHistory = membershipsCount > 0 || checkoutCount > 0

  if (hasHistory) {
    let archiveTierErr: { message?: string } | null = null
    const withDirectAccess = await supabase
      .from('membership_tiers')
      .update({
        active: false,
        visible: false,
        direct_access_only: true
      })
      .eq('id', body.tierId)
    archiveTierErr = withDirectAccess.error

    if (archiveTierErr && /direct_access_only/i.test(archiveTierErr.message ?? '')) {
      const legacyFallback = await supabase
        .from('membership_tiers')
        .update({
          active: false,
          visible: false
        })
        .eq('id', body.tierId)
      archiveTierErr = legacyFallback.error
    }

    if (archiveTierErr) throw createError({ statusCode: 500, statusMessage: archiveTierErr.message })

    let archiveVarErr: { message?: string } | null = null
    const withProviderFilter = await supabase
      .from('membership_plan_variations')
      .update({
        active: false,
        visible: false
      })
      .eq('tier_id', body.tierId)
      .eq('provider', 'square')
    archiveVarErr = withProviderFilter.error
    if (archiveVarErr && isSchemaMissingColumnError(archiveVarErr.message)) {
      const noProviderFilter = await supabase
        .from('membership_plan_variations')
        .update({
          active: false,
          visible: false
        })
        .eq('tier_id', body.tierId)
      archiveVarErr = noProviderFilter.error
    }
    if (archiveVarErr) throw createError({ statusCode: 500, statusMessage: archiveVarErr.message })

    return {
      ok: true,
      tierId: body.tierId,
      mode: 'archived',
      squareWarnings
    }
  }

  const { error: variationDeleteErr } = await supabase
    .from('membership_plan_variations')
    .delete()
    .eq('tier_id', body.tierId)
    .eq('provider', 'square')

  if (variationDeleteErr && isSchemaMissingColumnError(variationDeleteErr.message)) {
    const { error: fallbackVariationDeleteErr } = await supabase
      .from('membership_plan_variations')
      .delete()
      .eq('tier_id', body.tierId)
    if (fallbackVariationDeleteErr) throw createError({ statusCode: 500, statusMessage: fallbackVariationDeleteErr.message })
  } else if (variationDeleteErr) {
    throw createError({ statusCode: 500, statusMessage: variationDeleteErr.message })
  }

  const { error: tierDeleteErr } = await supabase
    .from('membership_tiers')
    .delete()
    .eq('id', body.tierId)
  if (tierDeleteErr) throw createError({ statusCode: 500, statusMessage: tierDeleteErr.message })

  return {
    ok: true,
    tierId: body.tierId,
    mode: 'deleted',
    squareWarnings
  }
})
