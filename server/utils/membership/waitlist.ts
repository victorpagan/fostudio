import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { getServerConfig } from '~~/server/utils/config/secret'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'
import { getSingleTierCapacity } from '~~/server/utils/membership/capacity'

type WaitlistCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

type WaitlistRow = {
  id: string
  tier_id: string
  cadence: WaitlistCadence | null
  user_id: string | null
  email: string
  phone: string | null
  is_priority_member: boolean
  status: 'pending' | 'invited' | 'claimed' | 'removed'
  created_at: string
}

function cadenceLabel(cadence: WaitlistCadence | null) {
  if (cadence === 'daily') return 'Daily'
  if (cadence === 'weekly') return 'Weekly'
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return 'Monthly'
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized || null
}

function buildWaitlistCheckoutUrl(origin: string, tierId: string, cadence: WaitlistCadence | null, isPriorityMember: boolean) {
  const params = new URLSearchParams({
    tier: tierId,
    cadence: cadence ?? 'monthly',
    returnTo: isPriorityMember ? '/dashboard/membership' : '/memberships'
  })
  if (isPriorityMember) {
    params.set('mode', 'switch')
  }
  return `${origin}/checkout?${params.toString()}`
}

export async function inviteWaitlistForTier(event: H3Event, tierId: string) {
  const supabase = serverSupabaseServiceRole(event) as any
  const capacity = await getSingleTierCapacity(supabase, tierId)

  if (capacity.cap === null || capacity.spotsLeft === null || capacity.spotsLeft <= 0) {
    return {
      invited: 0,
      attempted: 0,
      skipped: 'no_open_spots'
    } as const
  }

  const { data: tierRow, error: tierErr } = await supabase
    .from('membership_tiers')
    .select('id,display_name')
    .eq('id', tierId)
    .maybeSingle()

  if (tierErr) {
    throw createError({ statusCode: 500, statusMessage: tierErr.message })
  }
  if (!tierRow?.id) {
    return {
      invited: 0,
      attempted: 0,
      skipped: 'tier_not_found'
    } as const
  }

  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID').catch(() => null)
  if (!locationId || typeof locationId !== 'string') {
    return {
      invited: 0,
      attempted: 0,
      skipped: 'missing_location_id'
    } as const
  }

  const { data: waitlistRowsRaw, error: waitlistErr } = await supabase
    .from('membership_waitlist')
    .select('id,tier_id,cadence,user_id,email,phone,is_priority_member,status,created_at')
    .eq('tier_id', tierId)
    .eq('status', 'pending')
    .order('is_priority_member', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(capacity.spotsLeft)

  if (waitlistErr) {
    throw createError({ statusCode: 500, statusMessage: waitlistErr.message })
  }

  const waitlistRows = (waitlistRowsRaw ?? []) as WaitlistRow[]
  if (!waitlistRows.length) {
    return {
      invited: 0,
      attempted: 0,
      skipped: 'empty_waitlist'
    } as const
  }

  const nowIso = new Date().toISOString()
  const origin = getRequestURL(event).origin
  let invited = 0

  for (const row of waitlistRows) {
    const toEmail = normalizeEmail(row.email)
    if (!toEmail) continue

    const checkoutUrl = buildWaitlistCheckoutUrl(origin, tierId, row.cadence, row.is_priority_member)
    try {
      const sendResult = await sendViaFomailer(event, {
        type: 'membership.waitlistInvite',
        payload: {
          to: toEmail,
          userId: row.user_id ?? null,
          eventType: 'membership.waitlistInvite',
          locationId,
          tierId,
          tierName: tierRow.display_name ?? tierId,
          cadence: row.cadence ?? 'monthly',
          cadenceLabel: cadenceLabel(row.cadence),
          checkoutUrl,
          isPriorityMember: row.is_priority_member
        }
      })

      if (!sendResult.ok) {
        console.warn('[membership/waitlist] mail send skipped', {
          tierId,
          waitlistId: row.id,
          reason: sendResult.reason
        })
        continue
      }

      const { error: updateErr } = await supabase
        .from('membership_waitlist')
        .update({
          status: 'invited',
          invited_at: nowIso,
          updated_at: nowIso,
          metadata: {
            checkout_url: checkoutUrl,
            location_id: locationId,
            mail_type: 'membership.waitlistInvite'
          }
        })
        .eq('id', row.id)
        .eq('status', 'pending')

      if (updateErr) {
        console.warn('[membership/waitlist] failed to mark invited', {
          tierId,
          waitlistId: row.id,
          message: updateErr.message
        })
        continue
      }

      invited += 1
    } catch (error) {
      console.warn('[membership/waitlist] mail send failed', {
        tierId,
        waitlistId: row.id,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return {
    invited,
    attempted: waitlistRows.length,
    skipped: invited === 0 ? 'send_failed' : null
  } as const
}
