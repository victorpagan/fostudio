import { requireServerAdmin } from '~~/server/utils/auth'
import { getGoogleCalendarSyncSettings } from '~~/server/utils/integrations/googleCalendar'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const settings = await getGoogleCalendarSyncSettings(event)

  const nowIso = new Date().toISOString()
  const inSevenDaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { count: activeCount, error: activeErr } = await db
    .from('external_calendar_events')
    .select('id', { head: true, count: 'exact' })
    .eq('provider', 'google')
    .eq('calendar_id', settings.calendarId || '__unset__')
    .eq('active', true)

  if (activeErr) throw createError({ statusCode: 500, statusMessage: activeErr.message })

  const { count: nextWeekCount, error: nextErr } = await db
    .from('external_calendar_events')
    .select('id', { head: true, count: 'exact' })
    .eq('provider', 'google')
    .eq('calendar_id', settings.calendarId || '__unset__')
    .eq('active', true)
    .lt('start_time', inSevenDaysIso)
    .gt('end_time', nowIso)

  if (nextErr) throw createError({ statusCode: 500, statusMessage: nextErr.message })

  return {
    settings,
    stats: {
      activeSyncedEvents: Number(activeCount ?? 0),
      nextWeekEvents: Number(nextWeekCount ?? 0)
    }
  }
})
