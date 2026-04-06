import { z } from 'zod'
import { getHeader, createError, getQuery } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getKey } from '~~/server/utils/config/secret'
import { runAnalyticsPipeline, type AnalyticsRunScope } from '~~/server/utils/analytics/run'
import { readAnalyticsOutputsForEvent } from '~~/server/utils/analytics/outputs'
import { buildAnalyticsRunEnvelope } from '~~/server/utils/analytics/response'

type AnalyticsRunAuthMode = 'shared_key' | 'admin'

const bodySchema = z.object({
  requireSupabase: z.boolean().optional().default(true)
})

const scopeSchema = z.enum(['weekly', 'monthly', 'refresh'])

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

function resolveScope(event: Parameters<typeof getQuery>[0]): AnalyticsRunScope {
  const rawScope = getQuery(event).scope
  const value = Array.isArray(rawScope) ? rawScope[0] : rawScope
  const parsed = scopeSchema.safeParse(value ?? 'weekly')

  if (parsed.success) return parsed.data

  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid analytics scope. Expected weekly, monthly, or refresh.'
  })
}

export default defineEventHandler(async (event) => {
  const authMode = await requireAnalyticsRunAuth(event)
  const body = bodySchema.parse((await readBody(event).catch(() => ({}))) ?? {})
  const scope = resolveScope(event)
  const run = await runAnalyticsPipeline({
    requireSupabase: body.requireSupabase,
    scope
  })

  if (!run.ok) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Analytics pipeline failed',
      data: run
    })
  }

  const outputs = await readAnalyticsOutputsForEvent(event)
  const scoped = buildAnalyticsRunEnvelope(scope, outputs)

  return {
    ok: true,
    authMode,
    ...scoped,
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
