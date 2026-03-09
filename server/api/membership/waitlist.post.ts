import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { getSingleTierCapacity, isPriorityMemberForWaitlist } from '~~/server/utils/membership/capacity'
import { inviteWaitlistForTier } from '~~/server/utils/membership/waitlist'

const waitlistCadenceSchema = z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual'])

const bodySchema = z.object({
  tier: z.string().min(1),
  cadence: waitlistCadenceSchema.optional().default('monthly'),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(32).optional().nullable()
})

function normalizeEmail(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized || null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  const supabase = serverSupabaseServiceRole(event) as any

  const body = bodySchema.parse(await readBody(event))
  const email = normalizeEmail(body.email ?? user?.email ?? null)
  if (!email) {
    throw createError({ statusCode: 400, statusMessage: 'Email is required to join the waitlist.' })
  }

  const { data: tierRow, error: tierErr } = await supabase
    .from('membership_tiers')
    .select('id,display_name,active')
    .eq('id', body.tier)
    .maybeSingle()

  if (tierErr) {
    throw createError({ statusCode: 500, statusMessage: tierErr.message })
  }
  if (!tierRow?.id || !tierRow.active) {
    throw createError({ statusCode: 400, statusMessage: 'That membership tier is not available for waitlist signup.' })
  }

  const isPriorityMember = user?.sub
    ? await isPriorityMemberForWaitlist(supabase, user.sub)
    : false

  const nowIso = new Date().toISOString()
  let existing: { id: string } | null = null

  if (user?.sub) {
    const { data } = await supabase
      .from('membership_waitlist')
      .select('id')
      .eq('tier_id', body.tier)
      .eq('user_id', user.sub)
      .in('status', ['pending', 'invited'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    existing = data ?? null
  } else {
    const { data } = await supabase
      .from('membership_waitlist')
      .select('id')
      .eq('tier_id', body.tier)
      .is('user_id', null)
      .ilike('email', email)
      .in('status', ['pending', 'invited'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    existing = data ?? null
  }

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from('membership_waitlist')
      .update({
        cadence: body.cadence,
        email,
        phone: body.phone?.trim() || null,
        is_priority_member: isPriorityMember,
        status: 'pending',
        updated_at: nowIso
      })
      .eq('id', existing.id)

    if (updateErr) {
      throw createError({ statusCode: 500, statusMessage: updateErr.message })
    }
  } else {
    const { error: insertErr } = await supabase
      .from('membership_waitlist')
      .insert({
        tier_id: body.tier,
        cadence: body.cadence,
        user_id: user?.sub ?? null,
        email,
        phone: body.phone?.trim() || null,
        is_priority_member: isPriorityMember,
        status: 'pending',
        updated_at: nowIso
      })

    if (insertErr) {
      throw createError({ statusCode: 500, statusMessage: insertErr.message })
    }
  }

  const capacity = await getSingleTierCapacity(supabase, body.tier)
  const inviteResult = await inviteWaitlistForTier(event, body.tier).catch((error) => {
    console.warn('[membership/waitlist] invite pass failed', {
      tier: body.tier,
      message: error instanceof Error ? error.message : String(error)
    })
    return null
  })

  return {
    ok: true,
    joined: true,
    tier: body.tier,
    tierDisplayName: tierRow.display_name ?? body.tier,
    isPriorityMember,
    waitlistStatus: inviteResult?.invited ? 'invited' : 'pending',
    cap: capacity.cap,
    activeMembers: capacity.active,
    spotsLeft: capacity.spotsLeft,
    message: inviteResult?.invited
      ? 'A spot is available. Check your email for the invite link.'
      : 'You are on the waitlist. We will email you when a spot opens.'
  }
})
