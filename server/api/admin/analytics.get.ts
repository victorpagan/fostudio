import { requireServerAdmin } from '~~/server/utils/auth'
import { readAnalyticsOutputsForEvent, type AnalyticsOutputsPayload } from '~~/server/utils/analytics/outputs'

export default defineEventHandler(async (event): Promise<AnalyticsOutputsPayload> => {
  await requireServerAdmin(event)
  return await readAnalyticsOutputsForEvent(event)
})
