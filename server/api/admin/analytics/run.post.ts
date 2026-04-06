import { z } from 'zod'
import { createError } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { runAnalyticsPipeline } from '~~/server/utils/analytics/run'
import { readAnalyticsOutputsForEvent } from '~~/server/utils/analytics/outputs'

const bodySchema = z.object({
  requireSupabase: z.boolean().optional().default(true)
})

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)
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
