import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { syncGoogleCalendarToExternalBlocks } from '~~/server/utils/integrations/googleCalendar'

const bodySchema = z.object({
  force: z.boolean().optional().default(true)
})

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  try {
    const result = await syncGoogleCalendarToExternalBlocks(event, {
      force: body.force,
      dryRun: false,
      reason: 'admin_sync_now'
    })
    return { result }
  } catch (error: unknown) {
    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : 'Google Calendar sync failed'
    })
  }
})
