import { z } from 'zod'
import { getHeader } from 'h3'
import { getKey } from '~~/server/utils/config/secret'
import { requireServerAdmin } from '~~/server/utils/auth'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().max(120).optional()
})

function readBearerOrHeaderKey(event: Parameters<typeof getHeader>[0]) {
  const explicit = getHeader(event, 'x-access-key')
  if (explicit) return explicit.trim()

  const auth = getHeader(event, 'authorization')
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

async function requireInternalAccessAuth(event: Parameters<typeof getHeader>[0]) {
  const expected = await getKey(event, 'ACCESS_AUTOMATION_SHARED_KEY').catch(() => null)
  const provided = readBearerOrHeaderKey(event)

  if (typeof expected === 'string' && expected.trim() && provided === expected.trim()) {
    return { mode: 'shared_key' as const }
  }

  await requireServerAdmin(event)
  return { mode: 'admin' as const }
}

export default defineEventHandler(async (event) => {
  const auth = await requireInternalAccessAuth(event)
  const body = bodySchema.parse(await readBody(event))

  const queued = await enqueueBookingAccessSync(event, {
    bookingId: body.bookingId,
    reason: body.reason ?? (auth.mode === 'shared_key' ? 'internal_webhook_sync' : 'internal_admin_sync')
  })

  return {
    ok: true,
    authMode: auth.mode,
    queued
  }
})
