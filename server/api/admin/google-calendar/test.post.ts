import { requireServerAdmin } from '~~/server/utils/auth'
import { syncGoogleCalendarToExternalBlocks } from '~~/server/utils/integrations/googleCalendar'

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)

  try {
    const result = await syncGoogleCalendarToExternalBlocks(event, {
      force: true,
      dryRun: true,
      reason: 'admin_connection_test'
    })
    return { result }
  } catch (error: unknown) {
    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : 'Google Calendar connection test failed'
    })
  }
})
