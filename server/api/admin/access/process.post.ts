import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { processDueAccessJobs } from '~~/server/utils/access/jobs'

const bodySchema = z.object({
  limit: z.number().int().positive().max(200).optional()
})

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)
  const body = bodySchema.parse((await readBody(event).catch(() => ({}))) ?? {})

  const result = await processDueAccessJobs(event, {
    limit: body.limit
  })

  return { result }
})
