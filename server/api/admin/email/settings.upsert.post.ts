import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const templateSchema = z.object({
  eventType: z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._-]+$/),
  sendgridTemplateId: z.string().trim().min(3).max(255),
  category: z.enum(['critical', 'non_critical']),
  active: z.coerce.boolean().default(true),
  description: z.string().trim().max(300).optional().default('')
})

const bodySchema = z.object({
  adminCopies: z.object({
    criticalEnabled: z.coerce.boolean().default(true),
    nonCriticalEnabled: z.coerce.boolean().default(false),
    recipients: z.array(z.string().trim().email().max(320)).max(20).default([])
  }),
  templates: z.array(templateSchema).max(300).default([])
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))

  const recipients = [...new Set(
    body.adminCopies.recipients
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  )]

  const normalizedTemplates = new Map<string, {
    event_type: string
    sendgrid_template_id: string
    category: 'critical' | 'non_critical'
    active: boolean
    description: string | null
  }>()

  for (const template of body.templates) {
    const eventType = template.eventType.trim()
    normalizedTemplates.set(eventType, {
      event_type: eventType,
      sendgrid_template_id: template.sendgridTemplateId.trim(),
      category: template.category,
      active: Boolean(template.active),
      description: template.description.trim() || null
    })
  }

  const { error: prefError } = await db
    .from('mail_admin_copy_preferences')
    .upsert([{
      scope: 'global',
      critical_enabled: body.adminCopies.criticalEnabled,
      non_critical_enabled: body.adminCopies.nonCriticalEnabled,
      recipients
    }], { onConflict: 'scope' })

  if (prefError) throw createError({ statusCode: 500, statusMessage: prefError.message })

  const templates = [...normalizedTemplates.values()]
  const { data: existingTemplatesRaw, error: existingTemplatesError } = await db
    .from('mail_template_registry')
    .select('event_type')

  if (existingTemplatesError) {
    throw createError({ statusCode: 500, statusMessage: existingTemplatesError.message })
  }

  if (templates.length > 0) {
    const { error: templatesError } = await db
      .from('mail_template_registry')
      .upsert(templates, { onConflict: 'event_type' })

    if (templatesError) throw createError({ statusCode: 500, statusMessage: templatesError.message })
  }

  const incomingEventTypes = new Set(templates.map(template => template.event_type))
  const eventTypesToDelete = (existingTemplatesRaw ?? [])
    .map((row: { event_type: string }) => row.event_type)
    .filter((eventType: string) => !incomingEventTypes.has(eventType))

  if (eventTypesToDelete.length > 0) {
    const { error: deleteError } = await db
      .from('mail_template_registry')
      .delete()
      .in('event_type', eventTypesToDelete)

    if (deleteError) throw createError({ statusCode: 500, statusMessage: deleteError.message })
  }

  return { ok: true }
})
