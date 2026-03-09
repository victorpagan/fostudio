import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { ensureDoorCodeForUser } from '~~/server/utils/membership/doorCode'

function addDays(iso: string, days: number) {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString()
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const supabase = serverSupabaseServiceRole(event)

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,status')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  const membershipStatus = (membership?.status ?? '').toLowerCase()
  if (!membership || !['active', 'pending_checkout', 'past_due'].includes(membershipStatus)) {
    throw createError({ statusCode: 403, statusMessage: 'An active membership is required to request a code change.' })
  }

  const { customerId, doorCode } = await ensureDoorCodeForUser(event, {
    userId: user.sub,
    email: user.email ?? null
  })

  const { data: latestRequest, error: latestErr } = await supabase
    .from('door_code_change_requests')
    .select('id,requested_at,status')
    .eq('user_id', user.sub)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestErr) throw createError({ statusCode: 500, statusMessage: latestErr.message })

  if (latestRequest?.requested_at) {
    const cooldownEndsAt = addDays(latestRequest.requested_at, 30)
    if (cooldownEndsAt && Date.now() < new Date(cooldownEndsAt).getTime()) {
      throw createError({
        statusCode: 429,
        statusMessage: `Door code change requests are limited to once every 30 days. Next request: ${cooldownEndsAt}`
      })
    }
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('door_code_change_requests')
    .insert({
      user_id: user.sub,
      customer_id: customerId,
      status: 'pending'
    })
    .select('id,requested_at,status')
    .single()

  if (insertErr || !inserted) {
    throw createError({ statusCode: 500, statusMessage: insertErr?.message ?? 'Failed to create request' })
  }

  return {
    ok: true,
    requestId: inserted.id,
    status: inserted.status,
    requestedAt: inserted.requested_at,
    cooldownEndsAt: addDays(inserted.requested_at, 30),
    doorCode
  }
})
