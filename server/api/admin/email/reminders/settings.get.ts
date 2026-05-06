import { requireServerAdmin } from '~~/server/utils/auth'
import { getRegisteredMailEvents } from '~~/server/utils/mail/templateVariables'

type ReminderRuleRow = {
  event_type: string
  category: 'critical' | 'non_critical'
  enabled: boolean
  offsets_minutes: number[] | null
  cooldown_hours: number | string | null
  description: string | null
  admin_notes: string | null
  updated_at: string | null
}

type SupabaseQueryResult<T> = {
  data?: T[] | null
  error?: { message: string } | null
}

type SupabaseQueryBuilder<T> = PromiseLike<SupabaseQueryResult<T>> & {
  order: (column: string, options?: Record<string, unknown>) => SupabaseQueryBuilder<T>
  select: (columns: string) => SupabaseQueryBuilder<T>
}

type ReminderSettingsDb = {
  from: <T>(table: string) => SupabaseQueryBuilder<T>
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as unknown as ReminderSettingsDb
  const reminderEventTypes = new Set(getRegisteredMailEvents()
    .filter(item => item.eventType.endsWith('Reminder'))
    .map(item => item.eventType))
  const registeredByType = new Map(getRegisteredMailEvents().map(item => [item.eventType, item] as const))

  const { data, error } = await db
    .from('mail_reminder_rules')
    .select('event_type,category,enabled,offsets_minutes,cooldown_hours,description,admin_notes,updated_at')
    .order('event_type', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const rules = ((data ?? []) as ReminderRuleRow[])
    .filter(row => reminderEventTypes.has(row.event_type))
    .map((row) => {
      const registered = registeredByType.get(row.event_type)
      return {
        eventType: row.event_type,
        category: row.category ?? registered?.category ?? 'non_critical',
        enabled: Boolean(row.enabled),
        offsetsMinutes: Array.isArray(row.offsets_minutes) ? row.offsets_minutes : [],
        cooldownHours: Number(row.cooldown_hours ?? 0),
        description: row.description ?? registered?.description ?? '',
        adminNotes: row.admin_notes ?? '',
        updatedAt: row.updated_at
      }
    })

  return { rules }
})
