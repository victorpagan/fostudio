import { requireServerAdmin } from '~~/server/utils/auth'
import {
  getGoogleCalendarSyncSettings,
  listGoogleCalendarsForConnectedAccount
} from '~~/server/utils/integrations/googleCalendar'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const settings = await getGoogleCalendarSyncSettings(event)
  let calendars: Array<{
    id: string
    summary: string
    primary: boolean
    accessRole: string
  }> = []
  let calendarsError: string | null = null

  if (settings.oauthConnected) {
    try {
      calendars = await listGoogleCalendarsForConnectedAccount(event)
    } catch (error: unknown) {
      calendarsError = error instanceof Error ? error.message : 'Could not load Google calendars'
    }
  }

  let activeCount = 0
  let nextWeekCount = 0
  let statsError: string | null = null
  try {
    const nowIso = new Date().toISOString()
    const inSevenDaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const activeRes = await supabase
      .from('external_calendar_events')
      .select('id', { head: true, count: 'exact' })
      .eq('provider', 'google')
      .eq('calendar_id', settings.calendarId || '__unset__')
      .eq('active', true)
    if (activeRes.error) throw activeRes.error
    activeCount = Number(activeRes.count ?? 0)

    const nextRes = await supabase
      .from('external_calendar_events')
      .select('id', { head: true, count: 'exact' })
      .eq('provider', 'google')
      .eq('calendar_id', settings.calendarId || '__unset__')
      .eq('active', true)
      .lt('start_time', inSevenDaysIso)
      .gt('end_time', nowIso)
    if (nextRes.error) throw nextRes.error
    nextWeekCount = Number(nextRes.count ?? 0)
  } catch (error: unknown) {
    statsError = error instanceof Error ? error.message : 'Could not load Google sync stats'
  }

  return {
    settings,
    calendars,
    calendarsError,
    statsError,
    stats: {
      activeSyncedEvents: activeCount,
      nextWeekEvents: nextWeekCount
    }
  }
})
