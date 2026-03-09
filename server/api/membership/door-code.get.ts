import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

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

  const [{ data: customer, error: customerErr }, { data: latestRequest, error: requestErr }] = await Promise.all([
    supabase
      .from('customers')
      .select('id,door_code,door_code_updated_at')
      .eq('user_id', user.sub)
      .maybeSingle(),
    supabase
      .from('door_code_change_requests')
      .select('id,status,requested_at,resolved_at')
      .eq('user_id', user.sub)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ])

  if (customerErr) throw createError({ statusCode: 500, statusMessage: customerErr.message })
  if (requestErr) throw createError({ statusCode: 500, statusMessage: requestErr.message })

  const cooldownEndsAt = latestRequest?.requested_at ? addDays(latestRequest.requested_at, 30) : null
  const canRequestChange = !cooldownEndsAt || Date.now() >= new Date(cooldownEndsAt).getTime()

  return {
    doorCode: customer?.door_code ?? null,
    doorCodeUpdatedAt: customer?.door_code_updated_at ?? null,
    canRequestChange,
    cooldownEndsAt,
    latestRequest: latestRequest
      ? {
          id: latestRequest.id,
          status: latestRequest.status,
          requestedAt: latestRequest.requested_at,
          resolvedAt: latestRequest.resolved_at
        }
      : null
  }
})
