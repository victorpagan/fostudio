import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { resolveServerUserRole } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { buildSubscriptionCreatePhasesFromPlanVariation } from '~~/server/utils/square/subscriptionPhases'
import { markPromoRedemption, normalizePromoCode, resolvePromoPricing } from '~~/server/utils/promos'
import {
  findPendingCancelAction,
  findPendingSwapAction,
  normalizeSquareActionType
} from '~~/server/utils/square/subscriptionActions'

const bodySchema = z.object({
  tier: z.string().min(1),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']),
  promo_code: z.string().min(2).max(64).optional()
})

type MembershipRow = {
  id: string
  customer_id: string | null
  tier: string | null
  cadence: string | null
  status: string | null
  billing_provider: string | null
  billing_customer_id: string | null
  billing_subscription_id: string | null
  square_customer_id: string | null
  square_subscription_id: string | null
  square_plan_variation_id: string | null
  current_period_end: string | null
}

function normalizeStatus(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function toRecordArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
}

function toDateOnly(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

async function createOrderTemplateIdForPlanVariation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any,
  planVariationId: string,
  locationId: string
) {
  const variationRes = await square.catalog.object.get({
    objectId: planVariationId,
    includeRelatedObjects: false
  } as never)
  const variationObject = asRecord((variationRes as { object?: unknown, catalogObject?: unknown }).object ?? (variationRes as { catalogObject?: unknown }).catalogObject)
  const variationData = asRecord(variationObject?.subscriptionPlanVariationData ?? variationObject?.subscription_plan_variation_data)
  const subscriptionPlanId = readString(variationData, 'subscriptionPlanId', 'subscription_plan_id')
  if (!subscriptionPlanId) throw new Error(`Square variation ${planVariationId} is missing subscription plan id`)

  const planRes = await square.catalog.object.get({
    objectId: subscriptionPlanId,
    includeRelatedObjects: false
  } as never)
  const planObject = asRecord((planRes as { object?: unknown, catalogObject?: unknown }).object ?? (planRes as { catalogObject?: unknown }).catalogObject)
  const planData = asRecord(planObject?.subscriptionPlanData ?? planObject?.subscription_plan_data)
  const eligibleIdsRaw = planData?.eligibleItemIds ?? planData?.eligible_item_ids
  const eligibleItemIds = Array.isArray(eligibleIdsRaw)
    ? eligibleIdsRaw
      .map(entry => typeof entry === 'string' ? entry.trim() : '')
      .filter(Boolean)
    : []
  const eligibleItemId = eligibleItemIds[0] ?? null
  if (!eligibleItemId) throw new Error(`Square plan ${subscriptionPlanId} has no eligible item id`)

  const itemRes = await square.catalog.object.get({
    objectId: eligibleItemId,
    includeRelatedObjects: false
  } as never)
  const itemObject = asRecord((itemRes as { object?: unknown, catalogObject?: unknown }).object ?? (itemRes as { catalogObject?: unknown }).catalogObject)
  const itemData = asRecord(itemObject?.itemData ?? itemObject?.item_data)
  const itemVariations = Array.isArray(itemData?.variations) ? itemData.variations : []
  const firstItemVariation = itemVariations
    .map(entry => asRecord(entry))
    .find(Boolean) ?? null
  const itemVariationId = readString(firstItemVariation, 'id')
  if (!itemVariationId) throw new Error(`Square item ${eligibleItemId} has no item variation id`)

  const orderRes = await square.orders.create({
    idempotencyKey: `mpswap-order:${planVariationId}:${Date.now()}`,
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
  const orderId = readString(order, 'id')
  if (!orderId) throw new Error(`Could not create order template for variation ${planVariationId}`)
  return orderId
}

function readSquareErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (!error || typeof error !== 'object') return 'Square request failed'
  const details = (error as { errors?: unknown }).errors
  if (!Array.isArray(details) || details.length === 0) return 'Square request failed'
  const first = details[0]
  if (!first || typeof first !== 'object') return 'Square request failed'
  const detail = (first as { detail?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  const code = (first as { code?: unknown }).code
  if (typeof code === 'string' && code.trim()) return code.trim()
  return 'Square request failed'
}

function isSquareInternalApiError(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const errors = (error as { errors?: unknown }).errors
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0]
    if (first && typeof first === 'object') {
      const code = (first as { code?: unknown }).code
      const category = (first as { category?: unknown }).category
      if (code === 'INTERNAL_SERVER_ERROR' || category === 'API_ERROR') return true
    }
  }

  const message = error instanceof Error ? error.message : ''
  return message.includes('INTERNAL_SERVER_ERROR') || message.includes('"category": "API_ERROR"')
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function applyPromoDiscountToRelativePhases(
  phases: Array<Record<string, unknown>> | null,
  promoSquareDiscountId: string | null
) {
  if (!Array.isArray(phases) || !promoSquareDiscountId) return phases
  return phases.map((phase) => {
    const pricing = asRecord(phase.pricing)
    const pricingType = readString(pricing, 'type')?.toUpperCase()
    if (pricingType !== 'RELATIVE') return phase
    const discountIds = Array.isArray(pricing?.discountIds)
      ? pricing.discountIds.map(value => String(value)).filter(Boolean)
      : []
    if (!discountIds.includes(promoSquareDiscountId)) {
      discountIds.push(promoSquareDiscountId)
    }
    return {
      ...phase,
      pricing: {
        ...(pricing ?? {}),
        type: 'RELATIVE',
        discountIds
      }
    }
  })
}

async function ensureRelativeOrderTemplatesOnPhases(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any
  planVariationId: string
  locationId: string
  phases: Array<Record<string, unknown>> | null
}) {
  const { square, planVariationId, locationId } = params
  let { phases } = params
  if (!Array.isArray(phases) || !phases.length) return phases

  const hasMissingRelativeOrderTemplate = phases.some((phase) => {
    const pricing = asRecord(phase.pricing)
    const pricingType = readString(pricing, 'type')?.toUpperCase()
    const orderTemplateId = readString(phase, 'orderTemplateId', 'order_template_id')
    return pricingType === 'RELATIVE' && !orderTemplateId
  })
  if (!hasMissingRelativeOrderTemplate) return phases

  const orderTemplateId = await createOrderTemplateIdForPlanVariation(square, planVariationId, locationId)
  phases = phases.map((phase) => {
    const pricing = asRecord(phase.pricing)
    const pricingType = readString(pricing, 'type')?.toUpperCase()
    const existingOrderTemplateId = readString(phase, 'orderTemplateId', 'order_template_id')
    if (pricingType === 'RELATIVE' && !existingOrderTemplateId) {
      return {
        ...phase,
        orderTemplateId
      }
    }
    return phase
  })

  return phases
}

async function findManagedSquareSubscriptionId(
  square: Awaited<ReturnType<typeof useSquareClient>>,
  customerId: string,
  currentPlanVariationId: string | null
) {
  const filter: Record<string, unknown> = { customerIds: [customerId] }
  if (currentPlanVariationId) filter.planVariationIds = [currentPlanVariationId]

  const searchRes = await square.subscriptions.search({
    query: {
      filter,
      sort: { sortOrder: 'DESC', sortField: 'CREATED_AT' }
    },
    limit: 20
  } as never)

  const subscriptions = toRecordArray((searchRes as { subscriptions?: unknown }).subscriptions)
  if (!subscriptions.length) return null

  const activeFirst = subscriptions.sort((left, right) => {
    const leftStatus = (readString(left, 'status') ?? '').toUpperCase()
    const rightStatus = (readString(right, 'status') ?? '').toUpperCase()
    const leftActive = leftStatus === 'ACTIVE' ? 1 : 0
    const rightActive = rightStatus === 'ACTIVE' ? 1 : 0
    if (rightActive !== leftActive) return rightActive - leftActive

    const leftCreated = Date.parse(readString(left, 'createdAt', 'created_at') ?? '')
    const rightCreated = Date.parse(readString(right, 'createdAt', 'created_at') ?? '')
    return (Number.isNaN(rightCreated) ? 0 : rightCreated) - (Number.isNaN(leftCreated) ? 0 : leftCreated)
  })

  return readString(activeFirst[0] ?? null, 'id')
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event))
  const { isAdmin } = await resolveServerUserRole(event, user)

  const supabase = serverSupabaseServiceRole(event)

  const { data: membershipRaw, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,customer_id,tier,cadence,status,billing_provider,billing_customer_id,billing_subscription_id,square_customer_id,square_subscription_id,square_plan_variation_id,current_period_end')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membershipRaw) throw createError({ statusCode: 404, statusMessage: 'Membership not found' })

  const membership = membershipRaw as MembershipRow
  const status = normalizeStatus(membership.status)
  if (status !== 'active' && status !== 'past_due') {
    throw createError({ statusCode: 409, statusMessage: 'Membership must be active to change plans.' })
  }

  const billingProvider = (membership.billing_provider ?? '').toLowerCase()
  const currentPlanVariationId = membership.square_plan_variation_id?.trim() || null
  let customerId = membership.billing_customer_id?.trim() || membership.square_customer_id?.trim() || null
  let mappedCustomerId = membership.customer_id?.trim() || null
  if (mappedCustomerId) {
    const { data: customerRow, error: customerRowErr } = await supabase
      .from('customers')
      .select('id,square_customer_id')
      .eq('id', mappedCustomerId)
      .maybeSingle()
    if (customerRowErr) throw createError({ statusCode: 500, statusMessage: customerRowErr.message })
    if (customerRow?.square_customer_id?.trim()) {
      customerId = customerRow.square_customer_id.trim()
    }
  } else if (!customerId) {
    const { data: customerRow, error: customerRowErr } = await supabase
      .from('customers')
      .select('id,square_customer_id')
      .eq('user_id', user.sub)
      .maybeSingle()
    if (customerRowErr) throw createError({ statusCode: 500, statusMessage: customerRowErr.message })
    mappedCustomerId = customerRow?.id ?? null
    if (customerRow?.square_customer_id?.trim()) {
      customerId = customerRow.square_customer_id.trim()
    }
  }
  let subscriptionId = membership.billing_subscription_id?.trim() || membership.square_subscription_id?.trim() || null

  const { data: targetTier, error: targetTierErr } = await supabase
    .from('membership_tiers')
    .select('id,display_name,active,visible')
    .eq('id', body.tier)
    .maybeSingle()

  if (targetTierErr) throw createError({ statusCode: 500, statusMessage: targetTierErr.message })
  if (!targetTier || !targetTier.active) {
    throw createError({ statusCode: 400, statusMessage: 'Selected membership tier is not available.' })
  }
  if (!targetTier.visible && !isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied for this tier.' })
  }

  const { data: targetVariation, error: targetVariationErr } = await supabase
    .from('membership_plan_variations')
    .select('tier_id,cadence,provider,provider_plan_variation_id,price_cents,active,visible')
    .eq('tier_id', body.tier)
    .eq('cadence', body.cadence)
    .eq('provider', 'square')
    .maybeSingle()

  if (targetVariationErr) throw createError({ statusCode: 500, statusMessage: targetVariationErr.message })
  if (!targetVariation || !targetVariation.active) {
    throw createError({ statusCode: 400, statusMessage: 'Selected billing option is not available.' })
  }
  if (!targetVariation.visible && !isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied for this billing option.' })
  }

  const targetPlanVariationId = targetVariation.provider_plan_variation_id?.trim() || null

  if (!targetPlanVariationId) {
    throw createError({ statusCode: 503, statusMessage: 'This plan is not linked to a Square variation yet. Contact support.' })
  }

  const sameTier = (membership.tier ?? '') === body.tier
  const sameCadence = (membership.cadence ?? '') === body.cadence
  const sameVariation = (membership.square_plan_variation_id ?? '') === targetPlanVariationId
  if (sameTier && sameCadence && sameVariation) {
    throw createError({ statusCode: 409, statusMessage: 'You are already on this plan.' })
  }

  const square = await useSquareClient(event)
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
  const promoCode = normalizePromoCode(body.promo_code)
  const promoPricing = promoCode
    ? await resolvePromoPricing({
      supabase,
      promoCode,
      context: 'membership',
      tierId: body.tier,
      basePriceCents: Number(targetVariation.price_cents ?? 0)
    })
    : null

  let targetPhases = await buildSubscriptionCreatePhasesFromPlanVariation(square, targetPlanVariationId) as Array<Record<string, unknown>> | null
  targetPhases = applyPromoDiscountToRelativePhases(targetPhases, promoPricing?.squareDiscountId ?? null)
  targetPhases = await ensureRelativeOrderTemplatesOnPhases({
    square,
    planVariationId: targetPlanVariationId,
    locationId,
    phases: targetPhases
  })
  if (!subscriptionId && customerId) {
    try {
      subscriptionId = await findManagedSquareSubscriptionId(square, customerId, currentPlanVariationId)
      if (subscriptionId) {
        const patch: Record<string, unknown> = {
          billing_provider: 'square',
          billing_subscription_id: subscriptionId
        }
        if (!membership.billing_customer_id && customerId) {
          patch.billing_customer_id = customerId
        }
        if (!membership.square_customer_id && customerId) {
          patch.square_customer_id = customerId
        }
        if (!membership.customer_id && mappedCustomerId) {
          patch.customer_id = mappedCustomerId
        }
        const { error: linkPatchErr } = await supabase
          .from('memberships')
          .update(patch)
          .eq('id', membership.id)
        if (linkPatchErr) {
          console.warn('[membership/change-plan] failed to persist recovered Square linkage', {
            membershipId: membership.id,
            message: linkPatchErr.message
          })
        }
      }
    } catch (recoveryError) {
      console.warn('[membership/change-plan] failed to recover Square subscription id', {
        membershipId: membership.id,
        message: recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
      })
    }
  }

  if (!subscriptionId && customerId && currentPlanVariationId) {
    try {
      const startDate = toDateOnly(membership.current_period_end) ?? new Date().toISOString().slice(0, 10)
      const createPayload: Record<string, unknown> = {
        idempotencyKey: `mswap:${membership.id}`,
        locationId,
        customerId,
        planVariationId: currentPlanVariationId,
        startDate,
        timezone: 'America/Los_Angeles',
        source: { name: 'FO Studio plan swap bootstrap' }
      }

      let subscriptionPhases = await buildSubscriptionCreatePhasesFromPlanVariation(square, currentPlanVariationId) as Array<Record<string, unknown>> | null
      subscriptionPhases = await ensureRelativeOrderTemplatesOnPhases({
        square,
        planVariationId: currentPlanVariationId,
        locationId,
        phases: subscriptionPhases
      })
      if (subscriptionPhases?.length) {
        createPayload.phases = subscriptionPhases
      }

      const createRes = await square.subscriptions.create(createPayload as never)

      subscriptionId = readString(
        (createRes as { subscription?: Record<string, unknown> | null }).subscription ?? null,
        'id'
      )

      if (!subscriptionId) {
        subscriptionId = await findManagedSquareSubscriptionId(square, customerId, currentPlanVariationId)
      }

      if (subscriptionId) {
        const patch: Record<string, unknown> = {
          billing_provider: 'square',
          billing_subscription_id: subscriptionId
        }
        if (!membership.billing_customer_id && customerId) {
          patch.billing_customer_id = customerId
        }
        if (!membership.square_customer_id && customerId) {
          patch.square_customer_id = customerId
        }
        if (!membership.customer_id && mappedCustomerId) {
          patch.customer_id = mappedCustomerId
        }
        const { error: bootstrapPatchErr } = await supabase
          .from('memberships')
          .update(patch)
          .eq('id', membership.id)
        if (bootstrapPatchErr) {
          console.warn('[membership/change-plan] failed to persist bootstrapped Square subscription linkage', {
            membershipId: membership.id,
            message: bootstrapPatchErr.message
          })
        }
      }
    } catch (bootstrapError) {
      console.warn('[membership/change-plan] failed to bootstrap managed Square subscription', {
        membershipId: membership.id,
        message: bootstrapError instanceof Error ? bootstrapError.message : String(bootstrapError)
      })
    }
  }

  if ((billingProvider && billingProvider !== 'square') || !subscriptionId) {
    throw createError({ statusCode: 409, statusMessage: 'This membership is not linked to a managed Square subscription.' })
  }

  const currentRes = await square.subscriptions.get({
    subscriptionId,
    include: 'actions'
  } as never)
  const currentSubscription = (currentRes as { subscription?: Record<string, unknown> | null }).subscription ?? null
  if (!currentSubscription) {
    throw createError({ statusCode: 502, statusMessage: 'Could not load subscription from Square.' })
  }

  const actions = toRecordArray(currentSubscription.actions)
  const pendingCancel = findPendingCancelAction(actions)
  if (pendingCancel) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This subscription is set to cancel. Undo cancel before scheduling a plan change.'
    })
  }

  for (const action of actions) {
    if (normalizeSquareActionType(action.type) !== 'SWAP_PLAN') continue
    const actionId = typeof action.id === 'string' ? action.id : null
    if (!actionId) continue
    await square.subscriptions.deleteAction({
      subscriptionId,
      actionId
    } as never)
  }

  let swapError: unknown = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (attempt > 1) {
        await sleep(500 * attempt)
        // Regenerate order template when retrying to avoid stale template edge cases.
        targetPhases = await ensureRelativeOrderTemplatesOnPhases({
          square,
          planVariationId: targetPlanVariationId,
          locationId,
          phases: targetPhases
        })
      }
      const swapPayload: Record<string, unknown> = {
        subscriptionId,
        newPlanVariationId: targetPlanVariationId
      }
      if (targetPhases?.length) {
        swapPayload.phases = targetPhases
      }
      await square.subscriptions.swapPlan(swapPayload as never)
      swapError = null
      break
    } catch (error) {
      swapError = error
      if (!isSquareInternalApiError(error) || attempt === 3) break
    }
  }
  if (swapError) {
    throw createError({
      statusCode: isSquareInternalApiError(swapError) ? 502 : 400,
      statusMessage: readSquareErrorMessage(swapError)
    })
  }

  const refreshedRes = await square.subscriptions.get({
    subscriptionId,
    include: 'actions'
  } as never)
  const refreshed = (refreshedRes as { subscription?: Record<string, unknown> | null }).subscription ?? null
  const refreshedActions = toRecordArray(refreshed?.actions)
  const pendingSwap = findPendingSwapAction(refreshedActions)

  if (promoPricing?.promoId) {
    await markPromoRedemption(supabase, promoPricing.promoId, '[membership/change-plan]')
  }

  return {
    ok: true,
    mode: 'next_billing_cycle',
    effectiveDate: pendingSwap?.effectiveDate ?? null,
    target: {
      tier: body.tier,
      cadence: body.cadence,
      displayName: targetTier.display_name ?? body.tier
    },
    message: 'Plan change scheduled. It will take effect on your next billing cycle.'
  }
})
