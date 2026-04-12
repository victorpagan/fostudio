import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const INCIDENT_STATUSES = ['open', 'investigating', 'resolved', 'closed'] as const

type IncidentStatus = typeof INCIDENT_STATUSES[number]

const bodySchema = z.object({
  id: z.string().uuid(),
  status: z.enum(INCIDENT_STATUSES)
})

const allowedTransitions: Record<IncidentStatus, IncidentStatus[]> = {
  open: ['investigating', 'resolved', 'closed'],
  investigating: ['open', 'resolved', 'closed'],
  resolved: ['open', 'investigating', 'closed'],
  closed: ['open', 'investigating', 'resolved']
}

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: existing, error: existingError } = await db
    .from('admin_incident_reports')
    .select('id,status,resolved_at,resolved_by,closed_at,closed_by')
    .eq('id', body.id)
    .maybeSingle()

  if (existingError) throw createError({ statusCode: 500, statusMessage: existingError.message })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Incident report not found.' })

  const currentStatus = String(existing.status ?? '') as IncidentStatus
  if (currentStatus === body.status) {
    const { data, error } = await db
      .from('admin_incident_reports')
      .select('id,title,description,category,severity,status,member_user_id,occurred_at,resolved_at,resolved_by,closed_at,closed_by,created_by,updated_by,created_at,updated_at')
      .eq('id', body.id)
      .maybeSingle()

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    return { incident: data }
  }

  if (!allowedTransitions[currentStatus]?.includes(body.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid incident transition: ${currentStatus} -> ${body.status}`
    })
  }

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: body.status,
    updated_by: user.sub ?? null
  }

  if (body.status === 'closed') {
    patch.closed_at = nowIso
    patch.closed_by = user.sub ?? null
    if (!existing.resolved_at) {
      patch.resolved_at = nowIso
      patch.resolved_by = user.sub ?? null
    }
  } else if (body.status === 'resolved') {
    patch.resolved_at = nowIso
    patch.resolved_by = user.sub ?? null
    patch.closed_at = null
    patch.closed_by = null
  } else {
    patch.resolved_at = null
    patch.resolved_by = null
    patch.closed_at = null
    patch.closed_by = null
  }

  const { data, error } = await db
    .from('admin_incident_reports')
    .update(patch)
    .eq('id', body.id)
    .select('id,title,description,category,severity,status,member_user_id,occurred_at,resolved_at,resolved_by,closed_at,closed_by,created_by,updated_by,created_at,updated_at')
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Incident report not found.' })

  return { incident: data }
})
