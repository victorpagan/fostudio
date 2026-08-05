import { requireServerAdmin } from '~~/server/utils/auth'
import { syncGoogleCalendarToExternalBlocks } from '~~/server/utils/integrations/googleCalendar'

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)

  try {
    const result = await syncGoogleCalendarToExternalBlocks(event, {
      force: true,
      dryRun: false,
      reason: 'admin_peerspace_access_sync'
    })
    return { result }
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : 'Could not synchronize Peerspace calendar bookings.'
    })
  }
})
