import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { enqueueMemberActiveRefresh } from '~~/server/utils/access/jobs'
import { inviteWaitlistForTier } from '~~/server/utils/membership/waitlist'

const bodySchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().max(500).optional().nullable()
})

type MembershipRow = {
  id: string
  user_id: string
  tier: string | null
  cadence: string | null
  status: string | null
  billing_provider: string | null
  membership_source: string | null
  manual_grants_enabled: boolean | null
  manual_expires_at: string | null
}

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireServerAdmin(event)
  // Generated Supabase types can lag additive manual-membership columns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))
  const nowIso = new Date().toISOString()

  const { data: currentRaw, error: currentErr } = await db
    .from('memberships')
    .select('id,user_id,tier,cadence,status,billing_provider,membership_source,manual_grants_enabled,manual_expires_at')
    .eq('user_id', body.userId)
    .maybeSingle()

  if (currentErr) throw createError({ statusCode: 500, statusMessage: currentErr.message })
  const current = (currentRaw ?? null) as MembershipRow | null
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Membership not found.' })

  const source = String(current.membership_source ?? current.billing_provider ?? '').trim().toLowerCase()
  if (source !== 'manual') {
    throw createError({ statusCode: 409, statusMessage: 'Only admin-assigned manual memberships can be revoked here.' })
  }

  const { data: membership, error: updateErr } = await db
    .from('memberships')
    .update({
      status: 'canceled',
      canceled_at: nowIso,
      current_period_end: nowIso,
      manual_expires_at: nowIso,
      manual_grants_enabled: false,
      updated_at: nowIso
    })
    .eq('id', current.id)
    .select('id,user_id,tier,cadence,status,membership_source,manual_grants_enabled,manual_expires_at,current_period_end')
    .single()

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  const { error: cancelErr } = await db.rpc('cancel_pending_membership_credit_grants', {
    p_membership_id: current.id,
    p_reason: 'manual_membership_revoked',
    p_from: '1970-01-01T00:00:00.000Z'
  })
  if (cancelErr) {
    console.warn('[admin/members/manual-membership.revoke] grant cancel failed', {
      membershipId: current.id,
      message: cancelErr.message
    })
  }

  const { error: eventErr } = await db
    .from('admin_manual_membership_events')
    .insert({
      membership_id: current.id,
      user_id: body.userId,
      admin_user_id: user.sub,
      action: 'revoke',
      tier: current.tier,
      cadence: current.cadence,
      manual_grants_enabled: false,
      manual_expires_at: nowIso,
      reason: body.reason?.trim() || null,
      payload: {
        previousStatus: current.status,
        previousManualExpiresAt: current.manual_expires_at,
        source: 'admin_members_manual_membership_revoke'
      }
    })

  if (eventErr) {
    console.warn('[admin/members/manual-membership.revoke] audit insert failed', {
      membershipId: current.id,
      message: eventErr.message
    })
  }

  await enqueueMemberActiveRefresh(event, {
    userId: body.userId,
    reason: 'admin_manual_membership_revoke'
  })

  if (current.tier) {
    await inviteWaitlistForTier(event, current.tier).catch((error) => {
      console.warn('[admin/members/manual-membership.revoke] waitlist invite pass failed', {
        tierId: current.tier,
        message: error instanceof Error ? error.message : String(error)
      })
    })
  }

  return { membership }
})
