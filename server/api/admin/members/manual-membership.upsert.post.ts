import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { enqueueMemberActiveRefresh } from '~~/server/utils/access/jobs'
import { ensureDoorCodeForUser } from '~~/server/utils/membership/doorCode'
import { hasCurrentMembershipEntitlement } from '~~/server/utils/membership/status'
import { syncMembershipCreditGrantsForUser } from '~~/server/utils/membership/grantsSync'

const cadenceSchema = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual'])

const bodySchema = z.object({
  userId: z.string().uuid(),
  tierId: z.string().min(1),
  cadence: cadenceSchema,
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  manualGrantsEnabled: z.boolean().default(false),
  reason: z.string().max(500).optional().nullable()
})

type MembershipRow = {
  id: string
  user_id: string
  tier: string | null
  cadence: string | null
  status: string | null
  current_period_end: string | null
  billing_provider: string | null
  billing_subscription_id: string | null
  square_subscription_id: string | null
  membership_source: string | null
}

function normalizeIso(value: string | null | undefined, fallback: Date) {
  if (!value) return fallback.toISOString()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback.toISOString()
  return parsed.toISOString()
}

function normalizeNullableIso(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function isManagedSquareMembership(row: MembershipRow | null | undefined) {
  if (!row) return false
  const provider = String(row.billing_provider ?? '').trim().toLowerCase()
  const source = String(row.membership_source ?? '').trim().toLowerCase()
  const subscriptionId = String(row.billing_subscription_id ?? row.square_subscription_id ?? '').trim()
  return provider === 'square' && source !== 'manual' && Boolean(subscriptionId)
}

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireServerAdmin(event)
  // Generated Supabase types can lag additive manual-membership columns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))
  const now = new Date()
  const startsAt = normalizeIso(body.startsAt, now)
  const expiresAt = normalizeNullableIso(body.expiresAt)

  if (expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) {
    throw createError({ statusCode: 400, statusMessage: 'Manual membership end date must be after the start date.' })
  }
  if (expiresAt && Date.parse(expiresAt) <= now.getTime()) {
    throw createError({ statusCode: 400, statusMessage: 'Manual membership end date must be in the future.' })
  }

  const { data: tier, error: tierErr } = await db
    .from('membership_tiers')
    .select('id,active,visible,direct_access_only')
    .eq('id', body.tierId)
    .maybeSingle()

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })
  if (!tier?.id) throw createError({ statusCode: 404, statusMessage: 'Membership tier not found.' })
  if (tier.active === false) throw createError({ statusCode: 400, statusMessage: 'Inactive tiers cannot be assigned.' })

  const { data: variation, error: variationErr } = await db
    .from('membership_plan_variations')
    .select('id,credits_per_month,provider')
    .eq('tier_id', body.tierId)
    .eq('cadence', body.cadence)
    .in('provider', ['manual', 'square'])
    .eq('active', true)
    .order('provider', { ascending: true })
    .order('sort_order', { ascending: true })
    .limit(1)

  if (variationErr) throw createError({ statusCode: 500, statusMessage: variationErr.message })
  if (!variation?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Selected tier/cadence does not have an active plan variation.' })
  }

  const { data: currentRaw, error: currentErr } = await db
    .from('memberships')
    .select('id,user_id,tier,cadence,status,current_period_end,billing_provider,billing_subscription_id,square_subscription_id,membership_source')
    .eq('user_id', body.userId)
    .maybeSingle()

  if (currentErr) throw createError({ statusCode: 500, statusMessage: currentErr.message })

  const current = (currentRaw ?? null) as MembershipRow | null
  if (isManagedSquareMembership(current) && hasCurrentMembershipEntitlement(current)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This account has an active Square membership. Cancel or end the paid subscription before assigning a manual membership.'
    })
  }

  const patch = {
    user_id: body.userId,
    tier: body.tierId,
    cadence: body.cadence,
    status: 'active',
    membership_source: 'manual',
    manual_grants_enabled: body.manualGrantsEnabled,
    manual_assigned_by: user.sub,
    manual_assigned_at: now.toISOString(),
    manual_reason: body.reason?.trim() || null,
    manual_expires_at: expiresAt,
    billing_provider: 'manual',
    billing_subscription_id: null,
    square_subscription_id: null,
    square_plan_variation_id: null,
    checkout_provider: null,
    checkout_payment_link_id: null,
    checkout_order_template_id: null,
    current_period_start: startsAt,
    current_period_end: expiresAt,
    activated_at: startsAt,
    canceled_at: null,
    last_invoice_id: null,
    last_paid_at: null,
    updated_at: now.toISOString()
  }

  const query = current?.id
    ? db.from('memberships').update(patch).eq('id', current.id)
    : db.from('memberships').insert(patch)

  const { data: membership, error: saveErr } = await query
    .select('id,user_id,tier,cadence,status,membership_source,manual_grants_enabled,manual_expires_at,current_period_start,current_period_end')
    .single()

  if (saveErr) throw createError({ statusCode: 500, statusMessage: saveErr.message })

  const action = current?.membership_source === 'manual' || current?.billing_provider === 'manual'
    ? 'update'
    : 'assign'

  const { error: eventErr } = await db
    .from('admin_manual_membership_events')
    .insert({
      membership_id: membership.id,
      user_id: body.userId,
      admin_user_id: user.sub,
      action,
      tier: body.tierId,
      cadence: body.cadence,
      manual_grants_enabled: body.manualGrantsEnabled,
      manual_expires_at: expiresAt,
      reason: body.reason?.trim() || null,
      payload: {
        startsAt,
        source: 'admin_members_manual_membership_upsert',
        variationProvider: variation[0]?.provider ?? null
      }
    })

  if (eventErr) {
    console.warn('[admin/members/manual-membership.upsert] audit insert failed', {
      membershipId: membership.id,
      message: eventErr.message
    })
  }

  await ensureDoorCodeForUser(event, { userId: body.userId })
  await enqueueMemberActiveRefresh(event, {
    userId: body.userId,
    reason: 'admin_manual_membership_upsert'
  })

  await syncMembershipCreditGrantsForUser(event, body.userId, { processLimit: 24 }).catch((error) => {
    console.warn('[admin/members/manual-membership.upsert] grant sync failed', {
      membershipId: membership.id,
      message: error instanceof Error ? error.message : String(error)
    })
  })

  return { membership }
})
