import { getHeader } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { requireServerAdmin } from '~~/server/utils/auth'
import { expireStalePendingGuestBookings } from '~~/server/utils/booking/pendingPayments'
import { getKey } from '~~/server/utils/config/secret'
import { maybeAutoSyncGoogleCalendar } from '~~/server/utils/integrations/googleCalendar'

function readBearerOrHeaderKey(event: Parameters<typeof getHeader>[0]) {
  const explicit = getHeader(event, 'x-access-key')
  if (explicit) return explicit.trim()

  const authorization = getHeader(event, 'authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

async function requireMaintenanceAuth(event: Parameters<typeof getHeader>[0]) {
  const expected = await getKey(event, 'ACCESS_AUTOMATION_SHARED_KEY').catch(() => null)
  const provided = readBearerOrHeaderKey(event)

  if (typeof expected === 'string' && expected.trim() && provided === expected.trim()) {
    return 'shared_key' as const
  }

  await requireServerAdmin(event)
  return 'admin' as const
}

export default defineEventHandler(async (event) => {
  const authMode = await requireMaintenanceAuth(event)
  const serviceRole = serverSupabaseServiceRole(event)

  await expireStalePendingGuestBookings(serviceRole)
  const googleCalendar = await maybeAutoSyncGoogleCalendar(event, 'calendar_maintenance')

  return {
    ok: true,
    authMode,
    googleCalendar
  }
})
