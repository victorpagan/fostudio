import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getRegisteredMailEvents } from '~~/server/utils/mail/templateVariables'

const ruleSchema = z.object({
  eventType: z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._-]+$/),
  enabled: z.coerce.boolean(),
  offsetsMinutes: z.array(z.coerce.number().int().min(1).max(525600)).min(1).max(8),
  cooldownHours: z.coerce.number().min(0).max(8760).default(0),
  adminNotes: z.string().max(1000).optional().default('')
})

const bodySchema = z.object({
  rules: z.array(ruleSchema).max(25)
})

type SupabaseWriteResult = {
  error?: { message: string } | null
}

type ReminderSettingsDb = {
  from: (table: string) => {
    upsert: (values: Array<Record<string, unknown>>, options?: Record<string, unknown>) => Promise<SupabaseWriteResult>
  }
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as unknown as ReminderSettingsDb
  const body = bodySchema.parse(await readBody(event))
  const registeredEvents = new Map(getRegisteredMailEvents().map(item => [item.eventType, item] as const))

  const rows = body.rules.map((rule) => {
    const registered = registeredEvents.get(rule.eventType)
    if (!registered || !rule.eventType.endsWith('Reminder')) {
      throw createError({ statusCode: 400, statusMessage: `${rule.eventType} is not a registered reminder event.` })
    }

    return {
      event_type: rule.eventType,
      category: registered.category,
      enabled: rule.enabled,
      offsets_minutes: [...new Set(rule.offsetsMinutes)].sort((a, b) => b - a),
      cooldown_hours: rule.cooldownHours,
      description: registered.description,
      admin_notes: rule.adminNotes.trim() || null
    }
  })

  const { error } = await db
    .from('mail_reminder_rules')
    .upsert(rows, { onConflict: 'event_type' })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})
