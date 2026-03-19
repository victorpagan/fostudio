import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { enqueueMemberActiveRefresh } from '~~/server/utils/access/jobs'

const bodySchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().max(120).optional()
})

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const queued = await enqueueMemberActiveRefresh(event, {
    userId: body.userId,
    reason: body.reason ?? 'admin_manual_refresh'
  })

  return { ok: true, queued }
})
