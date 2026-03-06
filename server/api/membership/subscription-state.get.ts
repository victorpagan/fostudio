import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import {
  findPendingCancelAction,
  findPendingSwapAction,
  readSquareString,
  toRecordArray
} from '~~/server/utils/square/subscriptionActions'

type MembershipRow = {
  id: string
  tier: string | null
  cadence: string | null
  status: string | null
  billing_provider: string | null
  billing_subscription_id: string | null
  current_period_end: string | null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const supabase = serverSupabaseServiceRole(event)

  const { data: membershipRaw, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,tier,cadence,status,billing_provider,billing_subscription_id,current_period_end')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membershipRaw) {
    return {
      ok: true,
      hasManagedSubscription: false,
      currentPeriodEnd: null,
      pendingSwap: null,
      pendingCancel: null
    }
  }

  const membership = membershipRaw as MembershipRow
  if ((membership.billing_provider ?? '').toLowerCase() !== 'square' || !membership.billing_subscription_id) {
    return {
      ok: true,
      hasManagedSubscription: false,
      currentPeriodEnd: membership.current_period_end ?? null,
      pendingSwap: null,
      pendingCancel: null
    }
  }

  const square = await useSquareClient(event)
  const subRes = await square.subscriptions.get({
    subscriptionId: membership.billing_subscription_id,
    include: 'actions'
  } as never)
  const subscription = (subRes as { subscription?: Record<string, unknown> | null }).subscription ?? null
  if (!subscription) throw createError({ statusCode: 502, statusMessage: 'Could not load subscription from Square.' })

  const actions = toRecordArray(subscription.actions)
  const pendingSwap = findPendingSwapAction(actions)
  const pendingCancel = findPendingCancelAction(actions)

  let pendingSwapTarget: {
    tier: string | null
    cadence: string | null
    displayName: string | null
  } | null = null

  if (pendingSwap?.newPlanVariationId) {
    const { data: targetVariation } = await supabase
      .from('membership_plan_variations')
      .select('tier_id,cadence')
      .eq('provider', 'square')
      .eq('provider_plan_variation_id', pendingSwap.newPlanVariationId)
      .maybeSingle()

    if (targetVariation) {
      let tierDisplayName: string | null = null
      if (targetVariation.tier_id) {
        const { data: targetTier } = await supabase
          .from('membership_tiers')
          .select('display_name')
          .eq('id', targetVariation.tier_id)
          .maybeSingle()
        tierDisplayName = readSquareString(targetTier as Record<string, unknown>, 'display_name')
      }
      pendingSwapTarget = {
        tier: targetVariation.tier_id ?? null,
        cadence: targetVariation.cadence ?? null,
        displayName: tierDisplayName ?? targetVariation.tier_id ?? null
      }
    } else {
      pendingSwapTarget = {
        tier: null,
        cadence: null,
        displayName: null
      }
    }
  }

  return {
    ok: true,
    hasManagedSubscription: true,
    subscriptionStatus: readSquareString(subscription, 'status'),
    currentPeriodEnd: membership.current_period_end ?? null,
    pendingSwap: pendingSwap
      ? {
          actionId: pendingSwap.actionId,
          effectiveDate: pendingSwap.effectiveDate,
          target: pendingSwapTarget
        }
      : null,
    pendingCancel
  }
})
