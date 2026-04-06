import { z } from 'zod'
import { getHeader, createError } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getKey } from '~~/server/utils/config/secret'
import { runAnalyticsPipeline } from '~~/server/utils/analytics/run'
import { readAnalyticsOutputsForEvent } from '~~/server/utils/analytics/outputs'

type AnalyticsRunAuthMode = 'shared_key' | 'admin'

const bodySchema = z.object({
  requireSupabase: z.boolean().optional().default(true)
})

function readBearerOrHeaderKey(event: Parameters<typeof getHeader>[0]) {
  const explicit = getHeader(event, 'x-analytics-key') ?? getHeader(event, 'x-access-key')
  if (explicit) return explicit.trim()

  const auth = getHeader(event, 'authorization')
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

async function requireAnalyticsRunAuth(event: Parameters<typeof getHeader>[0]): Promise<AnalyticsRunAuthMode> {
  const provided = readBearerOrHeaderKey(event)

  const [runKey, exportKey] = await Promise.all([
    getKey(event, 'ANALYTICS_RUN_SHARED_KEY').catch(() => null),
    getKey(event, 'ANALYTICS_EXPORT_SHARED_KEY').catch(() => null)
  ])

  const expected = [runKey, exportKey]
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean)

  if (provided && expected.includes(provided)) {
    return 'shared_key'
  }

  await requireServerAdmin(event)
  return 'admin'
}

export default defineEventHandler(async (event) => {
  const authMode = await requireAnalyticsRunAuth(event)
  const body = bodySchema.parse((await readBody(event).catch(() => ({}))) ?? {})
  const run = await runAnalyticsPipeline({
    requireSupabase: body.requireSupabase
  })

  if (!run.ok) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Analytics pipeline failed',
      data: run
    })
  }

  const outputs = await readAnalyticsOutputsForEvent(event)

  return {
    ok: true,
    authMode,
    run,
    outputs: {
      generatedAt: outputs.generatedAt,
      freshness: outputs.freshness,
      storage: outputs.storage,
      source: outputs.source,
      missingFiles: outputs.missingFiles
    }
  }
})
