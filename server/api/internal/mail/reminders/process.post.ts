import { getHeader } from 'h3'
import { z } from 'zod'
import { getKey } from '~~/server/utils/config/secret'
import { requireServerAdmin } from '~~/server/utils/auth'
import { processMailReminders } from '~~/server/utils/mail/reminders'

const bodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  dryRun: z.coerce.boolean().optional().default(false),
  eventType: z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._-]+$/).optional()
})

function readBearerOrHeaderKey(event: Parameters<typeof getHeader>[0]) {
  const explicit = getHeader(event, 'x-reminder-key') ?? getHeader(event, 'x-access-key')
  if (explicit) return explicit.trim()

  const auth = getHeader(event, 'authorization')
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

async function requireReminderProcessorAuth(event: Parameters<typeof getHeader>[0]) {
  const expected = await getKey(event, 'MAIL_REMINDER_SHARED_KEY').catch(() => null)
  const provided = readBearerOrHeaderKey(event)

  if (typeof expected === 'string' && expected.trim() && provided === expected.trim()) {
    return { mode: 'shared_key' as const }
  }

  await requireServerAdmin(event)
  return { mode: 'admin' as const }
}

export default defineEventHandler(async (event) => {
  const auth = await requireReminderProcessorAuth(event)
  const rawBody = await readBody(event).catch(() => ({}))
  const body = bodySchema.parse(rawBody ?? {})
  const result = await processMailReminders(event, body)

  return {
    ...result,
    authMode: auth.mode
  }
})
