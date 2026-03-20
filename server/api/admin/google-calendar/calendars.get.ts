import { requireServerAdmin } from '~~/server/utils/auth'
import { listGoogleCalendarsForConnectedAccount } from '~~/server/utils/integrations/googleCalendar'

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)

  try {
    const calendars = await listGoogleCalendarsForConnectedAccount(event)
    return { calendars, error: null }
  } catch (error: unknown) {
    return {
      calendars: [],
      error: error instanceof Error ? error.message : 'Could not load Google calendars'
    }
  }
})
