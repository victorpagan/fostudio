import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const INCIDENT_CATEGORIES = ['safety', 'facility', 'equipment', 'access', 'billing', 'member', 'policy', 'other'] as const
const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
const INCIDENT_STATUSES = ['open', 'investigating', 'resolved', 'closed'] as const

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(160),
  description: z.string().max(10000).default(''),
  category: z.enum(INCIDENT_CATEGORIES),
  severity: z.enum(INCIDENT_SEVERITIES),
  status: z.enum(INCIDENT_STATUSES).default('open'),
  memberUserId: z.string().uuid().nullable().optional(),
  occurredAt: z.string().datetime({ offset: true }).nullable().optional()
})

function normalizeDescription(value: string) {
  return value.trim()
}

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const payload = {
    title: body.title.trim(),
    description: normalizeDescription(body.description),
    category: body.category,
    severity: body.severity,
    member_user_id: body.memberUserId ?? null,
    occurred_at: body.occurredAt ?? null,
    updated_by: user.sub ?? null
  } satisfies Record<string, unknown>

  if (body.id) {
    const { data, error } = await db
      .from('admin_incident_reports')
      .update(payload)
      .eq('id', body.id)
      .select('id,title,description,category,severity,status,member_user_id,occurred_at,resolved_at,resolved_by,closed_at,closed_by,created_by,updated_by,created_at,updated_at')
      .maybeSingle()

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data) throw createError({ statusCode: 404, statusMessage: 'Incident report not found.' })
    return { incident: data }
  }

  const { data, error } = await db
    .from('admin_incident_reports')
    .insert([{
      ...payload,
      status: body.status,
      created_by: user.sub ?? null
    }])
    .select('id,title,description,category,severity,status,member_user_id,occurred_at,resolved_at,resolved_by,closed_at,closed_by,created_by,updated_by,created_at,updated_at')
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { incident: data }
})
