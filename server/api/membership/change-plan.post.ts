import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { resolveServerUserRole } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import {
  findPendingCancelAction,
  findPendingSwapAction,
  normalizeSquareActionType,
  toRecordArray
} from '~~/server/utils/square/subscriptionActions'

const bodySchema = z.object({
  tier: z.string().min(1),
  cadence: z.enum(['monthly', 'quarterly', 'annual'])
})

type MembershipRow = {
  id: string
  tier: string | null
  cadence: string | null
  status: string | null
  billing_provider: string | null
  billing_subscription_id: string | null
  square_plan_variation_id: string | null
}

function normalizeStatus(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

async function resolvePlanVariationId(event: Parameters<typeof getServerConfig>[0], tierId: string, cadence: 'monthly' | 'quarterly' | 'annual', providerPlanVariationId: string | null | undefined) {
  const directValue = providerPlanVariationId?.trim()
  if (directValue) return directValue

  const configKey = `SQUARE_PLAN_VARIATION_${tierId.toUpperCase()}_${cadence.toUpperCase()}`
  try {
    const configuredValue = await getServerConfig(event, configKey)
    if (typeof configuredValue === 'string' && configuredValue.trim()) {
      return configuredValue.trim()
    }
  } catch {
    // fall through
  }

  return null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event))
  const { isAdmin } = await resolveServerUserRole(event, user)

  const supabase = serverSupabaseServiceRole(event)

  const { data: membershipRaw, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,tier,cadence,status,billing_provider,billing_subscription_id,square_plan_variation_id')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membershipRaw) throw createError({ statusCode: 404, statusMessage: 'Membership not found' })

  const membership = membershipRaw as MembershipRow
  const status = normalizeStatus(membership.status)
  if (status !== 'active' && status !== 'past_due') {
    throw createError({ statusCode: 409, statusMessage: 'Membership must be active to change plans.' })
  }

  if ((membership.billing_provider ?? '').toLowerCase() !== 'square' || !membership.billing_subscription_id) {
    throw createError({ statusCode: 409, statusMessage: 'This membership is not linked to a managed Square subscription.' })
  }

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

  const targetPlanVariationId = await resolvePlanVariationId(
    event,
    body.tier,
    body.cadence,
    targetVariation.provider_plan_variation_id
  )

  if (!targetPlanVariationId) {
    throw createError({ statusCode: 503, statusMessage: 'This plan is not configured for subscription changes yet.' })
  }

  const sameTier = (membership.tier ?? '') === body.tier
  const sameCadence = (membership.cadence ?? '') === body.cadence
  const sameVariation = (membership.square_plan_variation_id ?? '') === targetPlanVariationId
  if (sameTier && sameCadence && sameVariation) {
    throw createError({ statusCode: 409, statusMessage: 'You are already on this plan.' })
  }

  const square = await useSquareClient(event)
  const currentRes = await square.subscriptions.get({
    subscriptionId: membership.billing_subscription_id,
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
      subscriptionId: membership.billing_subscription_id,
      actionId
    } as never)
  }

  await square.subscriptions.swapPlan({
    subscriptionId: membership.billing_subscription_id,
    newPlanVariationId: targetPlanVariationId
  } as never)

  const refreshedRes = await square.subscriptions.get({
    subscriptionId: membership.billing_subscription_id,
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
