import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { resolveMembershipBillingPeriod } from '~~/server/utils/square/billingPeriod'

type MembershipGrantSyncRow = {
  id: string
  user_id: string | null
  tier: string | null
  cadence: string | null
  status: string | null
  membership_source: string | null
  manual_grants_enabled: boolean | null
  manual_assigned_at: string | null
  manual_expires_at: string | null
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

function addMonthsIso(value: Date, months: number) {
  const next = new Date(value.getTime())
  next.setUTCMonth(next.getUTCMonth() + months)
  return next.toISOString()
}

function parseDateOrNull(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cancelPendingMembershipGrants(db: any, membershipId: string, reason: string) {
  const { error } = await db.rpc('cancel_pending_membership_credit_grants', {
    p_membership_id: membershipId,
    p_reason: reason,
    p_from: '1970-01-01T00:00:00.000Z'
  })
  if (error) {
    console.warn('[membership-grant-sync] cancel pending grants failed', {
      membershipId,
      message: error.message
    })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncManualMembershipGrants(db: any, membership: MembershipGrantSyncRow) {
  const now = new Date()
  const expiresAt = parseDateOrNull(membership.manual_expires_at ?? membership.current_period_end)
  const isExpired = Boolean(expiresAt && expiresAt.getTime() <= now.getTime())

  if (!membership.manual_grants_enabled || isExpired) {
    await cancelPendingMembershipGrants(
      db,
      membership.id,
      isExpired ? 'manual_membership_expired' : 'manual_grants_disabled'
    )
    return
  }

  const periodStart = parseDateOrNull(membership.current_period_start)
    ?? parseDateOrNull(membership.manual_assigned_at)
    ?? now
  const periodEndIso = expiresAt && expiresAt.getTime() > now.getTime()
    ? expiresAt.toISOString()
    : addMonthsIso(new Date(Math.max(periodStart.getTime(), now.getTime())), 12)

  const { error: scheduleErr } = await db.rpc('schedule_membership_credit_grants', {
    p_membership_id: membership.id,
    p_invoice_id: null,
    p_period_start: periodStart.toISOString(),
    p_period_end: periodEndIso
  })

  if (scheduleErr) {
    console.warn('[membership-grant-sync] manual schedule failed', {
      membershipId: membership.id,
      message: scheduleErr.message
    })
  }
}

export async function syncMembershipCreditGrantsForUser(event: H3Event, userId: string, options?: GrantSyncOptions) {
  const supabase = serverSupabaseServiceRole(event)
  // Generated Supabase types can lag additive membership columns/RPC args.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: membershipsRaw, error: membershipsErr } = await db
    .from('memberships')
    .select('id,user_id,tier,cadence,status,membership_source,manual_grants_enabled,manual_assigned_at,manual_expires_at,billing_provider,billing_subscription_id,square_subscription_id,square_plan_variation_id,current_period_start,current_period_end')
    .eq('user_id', userId)
    .in('status', ['active', 'past_due'])

  if (membershipsErr) throw new Error(membershipsErr.message)

  const memberships = (membershipsRaw ?? []) as MembershipGrantSyncRow[]
  if (!memberships.length) {
    return {
      ranAt: new Date().toISOString(),
      membershipsChecked: 0
    } satisfies GrantSyncResult
  }

  let squarePromise: ReturnType<typeof useSquareClient> | null = null

  for (const membership of memberships) {
    const source = (membership.membership_source ?? membership.billing_provider ?? '').trim().toLowerCase()
    if (source === 'manual') {
      await syncManualMembershipGrants(db, membership)
      continue
    }

    if ((membership.billing_provider ?? '').toLowerCase() !== 'square') continue

    const subscriptionId = (
      membership.billing_subscription_id?.trim()
      || membership.square_subscription_id?.trim()
      || ''
    )
    if (!subscriptionId) continue

    try {
      squarePromise ??= useSquareClient(event)
      const square = await squarePromise
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
