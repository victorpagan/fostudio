import { getHeader } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getKey } from '~~/server/utils/config/secret'
import { readAnalyticsOutputsForEvent, type AnalyticsOutputsPayload } from '~~/server/utils/analytics/outputs'

type AnalyticsExportAuthMode = 'shared_key' | 'admin'

type AnalyticsExportResponse = AnalyticsOutputsPayload & {
  authMode: AnalyticsExportAuthMode
}

function readBearerOrHeaderKey(event: Parameters<typeof getHeader>[0]) {
  const explicit = getHeader(event, 'x-analytics-key') ?? getHeader(event, 'x-access-key')
  if (explicit) return explicit.trim()

  const auth = getHeader(event, 'authorization')
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

async function requireAnalyticsExportAuth(event: Parameters<typeof getHeader>[0]): Promise<AnalyticsExportAuthMode> {
  const expected = await getKey(event, 'ANALYTICS_EXPORT_SHARED_KEY').catch(() => null)
  const provided = readBearerOrHeaderKey(event)

  if (typeof expected === 'string' && expected.trim() && provided === expected.trim()) {
    return 'shared_key'
  }

  await requireServerAdmin(event)
  return 'admin'
}

export default defineEventHandler(async (event): Promise<AnalyticsExportResponse> => {
  const authMode = await requireAnalyticsExportAuth(event)
  setHeader(event, 'cache-control', 'no-store')

  return {
    ...(await readAnalyticsOutputsForEvent(event)),
    authMode
  }
})
