import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const querySchema = z.object({
  eventType: z.string().trim().min(3).max(160).optional(),
  status: z.enum(['sent', 'skipped', 'error']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
})

type ReminderDeliveryRow = {
  id: string
  event_type: string
  user_id: string
  entity_type: string
  entity_id: string
  reminder_key: string
  category: 'critical' | 'non_critical'
  status: 'sent' | 'skipped' | 'error'
  to_email: string | null
  template_id: string | null
  skip_reason: string | null
  error_message: string | null
  sent_at: string | null
  skipped_at: string | null
  created_at: string
}

type CustomerRow = {
  user_id: string | null
  email: string | null
  first_name: string | null
  last_name: string | null
}

type SupabaseQueryResult<T> = {
  data?: T[] | null
  error?: { message: string } | null
}

type SupabaseQueryBuilder<T> = PromiseLike<SupabaseQueryResult<T>> & {
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<T>
  in: (column: string, values: unknown[]) => SupabaseQueryBuilder<T>
  limit: (count: number) => SupabaseQueryBuilder<T>
  order: (column: string, options?: Record<string, unknown>) => SupabaseQueryBuilder<T>
  select: (columns: string) => SupabaseQueryBuilder<T>
}

type ReminderDeliveriesDb = {
  from: <T>(table: string) => SupabaseQueryBuilder<T>
}

function displayName(row: CustomerRow | undefined) {
  const name = [row?.first_name, row?.last_name]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ')
  return name || row?.email || ''
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as unknown as ReminderDeliveriesDb
  const query = querySchema.parse(getQuery(event))

  let builder = db
    .from('mail_reminder_deliveries')
    .select('id,event_type,user_id,entity_type,entity_id,reminder_key,category,status,to_email,template_id,skip_reason,error_message,sent_at,skipped_at,created_at')
    .order('created_at', { ascending: false })
    .limit(query.limit)

  if (query.eventType) builder = builder.eq('event_type', query.eventType)
  if (query.status) builder = builder.eq('status', query.status)

  const { data, error } = await builder
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const rows = (data ?? []) as ReminderDeliveryRow[]
  const userIds = [...new Set(rows.map(row => row.user_id).filter(Boolean))]
  const customers = new Map<string, CustomerRow>()

  if (userIds.length > 0) {
    const { data: customerRows, error: customersError } = await db
      .from('customers')
      .select('user_id,email,first_name,last_name')
      .in('user_id', userIds)

    if (customersError) throw createError({ statusCode: 500, statusMessage: customersError.message })
    for (const row of (customerRows ?? []) as CustomerRow[]) {
      if (row.user_id) customers.set(row.user_id, row)
    }
  }

  return {
    deliveries: rows.map((row) => {
      const customer = customers.get(row.user_id)
      return {
        id: row.id,
        eventType: row.event_type,
        userId: row.user_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        reminderKey: row.reminder_key,
        category: row.category,
        status: row.status,
        toEmail: row.to_email ?? customer?.email ?? '',
        customerName: displayName(customer),
        templateId: row.template_id,
        skipReason: row.skip_reason,
        errorMessage: row.error_message,
        sentAt: row.sent_at,
        skippedAt: row.skipped_at,
        createdAt: row.created_at
      }
    })
  }
})
