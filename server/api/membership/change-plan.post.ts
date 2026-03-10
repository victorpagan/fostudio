import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { resolveServerUserRole } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import {
  findPendingCancelAction,
  findPendingSwapAction,
  normalizeSquareActionType
} from '~~/server/utils/square/subscriptionActions'

const bodySchema = z.object({
  tier: z.string().min(1),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual'])
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
    .select('tier_id,cadence,provider,provider_plan_variation_id,active,visible')
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
      const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
      const startDate = toDateOnly(membership.current_period_end) ?? new Date().toISOString().slice(0, 10)
      const createRes = await square.subscriptions.create({
        idempotencyKey: `mswap:${membership.id}`,
        locationId,
        customerId,
        planVariationId: currentPlanVariationId,
        startDate,
        timezone: 'America/Los_Angeles',
        source: { name: 'FO Studio plan swap bootstrap' }
      } as never)

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

  await square.subscriptions.swapPlan({
    subscriptionId,
    newPlanVariationId: targetPlanVariationId
  } as never)

  const refreshedRes = await square.subscriptions.get({
    subscriptionId,
    include: 'actions'
  } as never)
  const refreshed = (refreshedRes as { subscription?: Record<string, unknown> | null }).subscription ?? null
  const refreshedActions = toRecordArray(refreshed?.actions)
  const pendingSwap = findPendingSwapAction(refreshedActions)

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
