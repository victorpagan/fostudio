import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { resolveMembershipBillingPeriod } from '~~/server/utils/square/billingPeriod'

type MembershipGrantSyncRow = {
  id: string
  tier: string | null
  cadence: string | null
  status: string | null
  billing_provider: string | null
  billing_subscription_id: string | null
  square_subscription_id: string | null
  square_plan_variation_id: string | null
  current_period_start: string | null
  current_period_end: string | null
}

type GrantSyncOptions = {
  processLimit?: number
}

type GrantSyncResult = {
  ranAt: string
  membershipsChecked: number
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function isoChanged(left: string | null | undefined, right: string | null | undefined) {
  if (!left && !right) return false
  if (!left || !right) return true
  const leftMs = Date.parse(left)
  const rightMs = Date.parse(right)
  if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) return left !== right
  return leftMs !== rightMs
}

export async function syncMembershipCreditGrantsForUser(event: H3Event, userId: string, options?: GrantSyncOptions) {
  const supabase = serverSupabaseServiceRole(event)
  const db = supabase as any

  const { data: membershipsRaw, error: membershipsErr } = await db
    .from('memberships')
    .select('id,tier,cadence,status,billing_provider,billing_subscription_id,square_subscription_id,square_plan_variation_id,current_period_start,current_period_end')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due'])
    .eq('billing_provider', 'square')

  if (membershipsErr) throw new Error(membershipsErr.message)

  const memberships = (membershipsRaw ?? []) as MembershipGrantSyncRow[]
  if (!memberships.length) {
    return {
      ranAt: new Date().toISOString(),
      membershipsChecked: 0
    } satisfies GrantSyncResult
  }

  const square = await useSquareClient(event)

  for (const membership of memberships) {
    const subscriptionId = (
      membership.billing_subscription_id?.trim()
      || membership.square_subscription_id?.trim()
      || ''
    )
    if (!subscriptionId) continue

    try {
      const subRes = await square.subscriptions.get({
        subscriptionId
      } as never)
      const subscription = (subRes as { subscription?: Record<string, unknown> | null }).subscription ?? null
      if (!subscription) continue

      const subscriptionStatus = (readString(subscription, 'status') ?? '').toUpperCase()
      if (subscriptionStatus && subscriptionStatus !== 'ACTIVE') continue

      const subscriptionPlanVariationId = readString(subscription, 'planVariationId', 'plan_variation_id')
      let effectiveCadence = membership.cadence?.trim() ?? ''
      const membershipPatch: Record<string, unknown> = {}

      if (subscriptionPlanVariationId) {
        const { data: variationRowRaw, error: variationErr } = await db
          .from('membership_plan_variations')
          .select('tier_id,cadence')
          .eq('provider', 'square')
          .eq('provider_plan_variation_id', subscriptionPlanVariationId)
          .maybeSingle()

        if (variationErr) {
          console.warn('[membership-grant-sync] variation lookup failed', {
            membershipId: membership.id,
            planVariationId: subscriptionPlanVariationId,
            message: variationErr.message
          })
        } else if (variationRowRaw) {
          const variationRow = variationRowRaw as { tier_id: string | null, cadence: string | null }
          const mappedTier = variationRow.tier_id?.trim() ?? null
          const mappedCadence = variationRow.cadence?.trim() ?? null

          if (mappedTier && mappedTier !== (membership.tier?.trim() ?? '')) {
            membershipPatch.tier = mappedTier
          }
          if (mappedCadence && mappedCadence !== (membership.cadence?.trim() ?? '')) {
            membershipPatch.cadence = mappedCadence
            effectiveCadence = mappedCadence
          }
          if (subscriptionPlanVariationId !== (membership.square_plan_variation_id?.trim() ?? '')) {
            membershipPatch.square_plan_variation_id = subscriptionPlanVariationId
          }
        }
      }

      if (!effectiveCadence) {
        effectiveCadence = membership.cadence?.trim() ?? ''
      }
      if (!effectiveCadence) continue

      const resolved = resolveMembershipBillingPeriod({
        cadence: effectiveCadence,
        subscription,
        fallbackStart: membership.current_period_start,
        fallbackEnd: membership.current_period_end
      })
      if (!resolved) continue

      if (Object.keys(membershipPatch).length > 0) {
        const { error: patchErr } = await db
          .from('memberships')
          .update(membershipPatch)
          .eq('id', membership.id)
        if (patchErr) {
          console.warn('[membership-grant-sync] membership plan sync update failed', {
            membershipId: membership.id,
            message: patchErr.message
          })
        }
      }

      const { error: scheduleErr } = await db.rpc('schedule_membership_credit_grants', {
        p_membership_id: membership.id,
        p_invoice_id: null,
        p_period_start: resolved.currentPeriodStart,
        p_period_end: resolved.currentPeriodEnd
      })
      if (scheduleErr) {
        console.warn('[membership-grant-sync] schedule failed', {
          membershipId: membership.id,
          message: scheduleErr.message
        })
        continue
      }

      if (isoChanged(membership.current_period_start, resolved.currentPeriodStart)
        || isoChanged(membership.current_period_end, resolved.currentPeriodEnd)) {
        const { error: updateErr } = await db
          .from('memberships')
          .update({
            current_period_start: resolved.currentPeriodStart,
            current_period_end: resolved.currentPeriodEnd
          })
          .eq('id', membership.id)

        if (updateErr) {
          console.warn('[membership-grant-sync] period update failed', {
            membershipId: membership.id,
            message: updateErr.message
          })
        }
      }
    } catch (error) {
      console.warn('[membership-grant-sync] subscription refresh failed', {
        membershipId: membership.id,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const { error: processErr } = await db.rpc('process_due_membership_credit_grants', {
    p_limit: options?.processLimit ?? 24
  })
  if (processErr) {
    throw new Error(processErr.message)
  }

  return {
    ranAt: new Date().toISOString(),
    membershipsChecked: memberships.length
  } satisfies GrantSyncResult
}
