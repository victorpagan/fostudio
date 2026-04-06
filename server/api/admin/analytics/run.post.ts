import { z } from 'zod'
import { createError, getQuery } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { runAnalyticsPipeline, type AnalyticsRunScope } from '~~/server/utils/analytics/run'
import { readAnalyticsOutputsForEvent } from '~~/server/utils/analytics/outputs'
import { buildAnalyticsRunEnvelope } from '~~/server/utils/analytics/response'

const bodySchema = z.object({
  requireSupabase: z.boolean().optional().default(true)
})

const scopeSchema = z.enum(['weekly', 'monthly', 'refresh'])

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
  await requireServerAdmin(event)
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
