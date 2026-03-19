import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { setDoorCodeForUser } from '~~/server/utils/membership/doorCode'
import { enqueueMemberActiveRefresh } from '~~/server/utils/access/jobs'

const bodySchema = z.object({
  userId: z.string().uuid(),
  doorCode: z.string().regex(/^\d{6}$/, 'Door code must be exactly 6 digits.')
})

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const { data: memberContext, error: memberContextErr } = await supabase
    .from('customers')
    .select('email')
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

  return {
    ok: true,
    customerId: result.customerId,
    doorCode: result.doorCode
  }
})
