import { requireServerAdmin } from '~~/server/utils/auth'
import {
  getAvailableVariablesByEvent,
  getRegisteredMailEvents,
  type MailTemplateCategory
} from '~~/server/utils/mail/templateVariables'

type MailTemplateRegistryRow = {
  event_type: string
  sendgrid_template_id: string
  category: MailTemplateCategory
  active: boolean
  description: string | null
  subject_template: string | null
  preheader_template: string | null
  body_template: string | null
}

type MailAdminCopyPreferencesRow = {
  scope: string
  critical_enabled: boolean
  non_critical_enabled: boolean
  recipients: string[] | null
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any

  const [{ data: prefRowRaw, error: prefError }, { data: templateRowsRaw, error: templateError }] = await Promise.all([
    db
      .from('mail_admin_copy_preferences')
      .select('scope,critical_enabled,non_critical_enabled,recipients')
      .eq('scope', 'global')
      .maybeSingle(),
    db
      .from('mail_template_registry')
      .select('event_type,sendgrid_template_id,category,active,description,subject_template,preheader_template,body_template')
      .order('event_type', { ascending: true })
  ])

  if (prefError) throw createError({ statusCode: 500, statusMessage: prefError.message })
  if (templateError) throw createError({ statusCode: 500, statusMessage: templateError.message })

  const prefRow = (prefRowRaw ?? null) as MailAdminCopyPreferencesRow | null
  const templateRows = (templateRowsRaw ?? []) as MailTemplateRegistryRow[]
  const registeredEvents = getRegisteredMailEvents()
  const templateMap = new Map(
    templateRows.map(row => [row.event_type, row] as const)
  )

  const mergedTemplates = registeredEvents.map((registryItem) => {
    const row = templateMap.get(registryItem.eventType) ?? null
    if (row) templateMap.delete(registryItem.eventType)

    return {
      eventType: registryItem.eventType,
      sendgridTemplateId: row?.sendgrid_template_id ?? '',
      category: row?.category ?? registryItem.category,
      active: row?.active ?? true,
      description: row?.description ?? registryItem.description,
      subjectTemplate: row?.subject_template ?? '',
      preheaderTemplate: row?.preheader_template ?? '',
      bodyTemplate: row?.body_template ?? ''
    }
  })

  for (const row of templateMap.values()) {
    mergedTemplates.push({
      eventType: row.event_type,
      sendgridTemplateId: row.sendgrid_template_id,
      category: row.category,
      active: row.active,
      description: row.description ?? '',
      subjectTemplate: row.subject_template ?? '',
      preheaderTemplate: row.preheader_template ?? '',
      bodyTemplate: row.body_template ?? ''
    })
  }

  return {
    adminCopies: {
      criticalEnabled: prefRow?.critical_enabled ?? true,
      nonCriticalEnabled: prefRow?.non_critical_enabled ?? false,
      recipients: Array.isArray(prefRow?.recipients)
        ? prefRow?.recipients.filter(item => typeof item === 'string' && item.trim().length > 0)
        : []
    },
    templates: mergedTemplates.sort((a, b) => a.eventType.localeCompare(b.eventType)),
    availableVariablesByEvent: getAvailableVariablesByEvent()
  }
})
