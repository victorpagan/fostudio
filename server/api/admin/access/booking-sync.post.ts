import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().max(120).optional()
})

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const queued = await enqueueBookingAccessSync(event, {
    bookingId: body.bookingId,
    reason: body.reason ?? 'admin_manual_sync'
  })

  return { ok: true, queued }
})
