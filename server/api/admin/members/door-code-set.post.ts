import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { setDoorCodeForUser } from '~~/server/utils/membership/doorCode'
import { enqueueMemberActiveRefresh } from '~~/server/utils/access/jobs'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'

const bodySchema = z.object({
  userId: z.string().uuid(),
  doorCode: z.string().regex(/^\d{6}$/, 'Door code must be exactly 6 digits.')
})

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const { data: memberContext, error: memberContextErr } = await supabase
    .from('customers')
    .select('email,first_name,last_name')
    .eq('user_id', body.userId)
    .maybeSingle()

  if (memberContextErr) throw createError({ statusCode: 500, statusMessage: memberContextErr.message })

  const result = await setDoorCodeForUser(event, {
    userId: body.userId,
    doorCode: body.doorCode,
    email: memberContext?.email ?? null
  })

  const nowIso = new Date().toISOString()
  const { error: resolveRequestsErr } = await supabase
    .from('door_code_change_requests')
    .update({
      status: 'resolved',
      resolved_at: nowIso,
      resolved_by: user.sub
    })
    .eq('user_id', body.userId)
    .eq('status', 'pending')

  if (resolveRequestsErr) {
    throw createError({ statusCode: 500, statusMessage: resolveRequestsErr.message })
  }

  await enqueueMemberActiveRefresh(event, {
    userId: body.userId,
    reason: 'admin_member_pin_set'
  }).catch((error) => {
    console.warn('[access/sync] failed to queue member active refresh', {
      userId: body.userId,
      error: (error as Error)?.message ?? String(error)
    })
  })

  const memberEmail = String(memberContext?.email ?? '').trim().toLowerCase()
  if (memberEmail) {
    const { data: membershipRow, error: membershipErr } = await supabase
      .from('memberships')
      .select('tier,status')
      .eq('user_id', body.userId)
      .in('status', ['active', 'past_due', 'pending_checkout'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (membershipErr) {
      console.warn('[mail] failed to load membership context for door code update mail', {
        userId: body.userId,
        message: membershipErr.message
      })
    }

    const memberName = [
      String(memberContext?.first_name ?? '').trim(),
      String(memberContext?.last_name ?? '').trim()
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || null

    const tierName = String(membershipRow?.tier ?? '').trim() || null
    const mailResponse = await sendViaFomailer(event, {
      type: 'membership.doorCodeUpdated',
      payload: {
        to: memberEmail,
        userId: body.userId,
        eventType: 'membership.doorCodeUpdated',
        tierId: tierName,
        tierName,
        membershipPlanName: tierName,
        customerName: memberName,
        customerEmail: memberEmail,
        doorCode: result.doorCode,
        doorCodeUpdatedAt: new Date().toISOString()
      }
    }).catch((error) => {
      console.warn('[mail] membership.doorCodeUpdated send failed', {
        userId: body.userId,
        message: error instanceof Error ? error.message : String(error)
      })
      return { ok: false as const, reason: 'request_failed' as const }
    })

    if (!mailResponse.ok) {
      console.warn('[mail] membership.doorCodeUpdated was not sent', {
        userId: body.userId,
        reason: mailResponse.reason ?? 'unknown'
      })
    }
  }

  return {
    ok: true,
    customerId: result.customerId,
    doorCode: result.doorCode
  }
})
