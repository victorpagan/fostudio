import { z } from 'zod'
import { getHeader } from 'h3'
import { getKey } from '~~/server/utils/config/secret'
import { requireServerAdmin } from '~~/server/utils/auth'
import { processDueAccessJobs } from '~~/server/utils/access/jobs'

const bodySchema = z.object({
  limit: z.number().int().positive().max(200).optional()
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
  const body = bodySchema.parse((await readBody(event).catch(() => ({}))) ?? {})

  const result = await processDueAccessJobs(event, {
    limit: body.limit
  })

  return {
    ok: true,
    authMode: auth.mode,
    result
  }
})
