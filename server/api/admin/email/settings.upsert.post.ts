import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const templateSchema = z.object({
  eventType: z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._-]+$/),
  sendgridTemplateId: z.string().trim().min(3).max(255),
  category: z.enum(['critical', 'non_critical']),
  active: z.coerce.boolean().default(true),
  description: z.string().trim().max(300).optional().default(''),
  subjectTemplate: z.string().max(300).optional().default(''),
  preheaderTemplate: z.string().max(300).optional().default(''),
  bodyTemplate: z.string().max(200_000).optional().default('')
})

const bodySchema = z.object({
  adminCopies: z.object({
    criticalEnabled: z.coerce.boolean().default(true),
    nonCriticalEnabled: z.coerce.boolean().default(false),
    recipients: z.array(z.string().trim().email().max(320)).max(20).default([])
  }),
  templates: z.array(templateSchema).max(300).default([])
})

function parseInlineStyle(style: string) {
  const declarations = new Map<string, string>()
  for (const part of style.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const separatorIndex = trimmed.indexOf(':')
    if (separatorIndex <= 0) continue

    const key = trimmed.slice(0, separatorIndex).trim().toLowerCase()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (!key || !value) continue
    declarations.set(key, value)
  }

  return declarations
}

function stringifyInlineStyle(declarations: Map<string, string>) {
  return [...declarations.entries()]
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
}

function applyResponsiveImageStyles(html: string) {
  return html.replace(/<img\b([^>]*?)>/gi, (_fullMatch, attrs: string) => {
    const styleMatch = attrs.match(/\sstyle\s*=\s*(['"])([\s\S]*?)\1/i)
    const styleDeclarations = parseInlineStyle(styleMatch?.[2] ?? '')

    if (!styleDeclarations.has('max-width')) styleDeclarations.set('max-width', '100%')
    if (!styleDeclarations.has('height')) styleDeclarations.set('height', 'auto')
    if (!styleDeclarations.has('display')) styleDeclarations.set('display', 'block')

    const nextStyle = stringifyInlineStyle(styleDeclarations)
    let nextAttrs = attrs

    if (styleMatch) {
      nextAttrs = attrs.replace(styleMatch[0], ` style="${nextStyle}"`)
    } else {
      nextAttrs = `${attrs} style="${nextStyle}"`
    }

    if (!/\sloading\s*=/i.test(nextAttrs)) {
      nextAttrs = `${nextAttrs} loading="lazy"`
    }

    return `<img${nextAttrs}>`
  })
}

function normalizeBodyTemplate(value: string): string | null {
  if (!value.trim()) return null

  const responsiveHtml = applyResponsiveImageStyles(value)

  const plainText = responsiveHtml
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plainText) return null
  return responsiveHtml
}

function findUnsupportedTemplateSyntax(value: string): string | null {
  if (!value.trim()) return null

  if (/{{{\s*[^}]+\s*}}}/.test(value)) {
    return 'Triple-brace tokens are not supported in registry copy. Use {{ variableName }} tokens only.'
  }
  if (/{{\s*[#/][^}]+}}/.test(value)) {
    return 'Handlebars control blocks (for example {{#if}}...{{/if}}) are not supported. Use plain {{ variableName }} tokens only.'
  }

  return null
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))
  const excludedEventTypes = new Set(['order.confirmation'])

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
    subject_template: string | null
    preheader_template: string | null
    body_template: string | null
  }>()

  for (const template of body.templates) {
    const eventType = template.eventType.trim()
    if (excludedEventTypes.has(eventType)) continue
    const unsupportedSubject = findUnsupportedTemplateSyntax(template.subjectTemplate)
    if (unsupportedSubject) {
      throw createError({
        statusCode: 400,
        statusMessage: `${eventType} subject template: ${unsupportedSubject}`
      })
    }

    const unsupportedPreheader = findUnsupportedTemplateSyntax(template.preheaderTemplate)
    if (unsupportedPreheader) {
      throw createError({
        statusCode: 400,
        statusMessage: `${eventType} preheader template: ${unsupportedPreheader}`
      })
    }

    const unsupportedBody = findUnsupportedTemplateSyntax(template.bodyTemplate)
    if (unsupportedBody) {
      throw createError({
        statusCode: 400,
        statusMessage: `${eventType} body template: ${unsupportedBody}`
      })
    }

    normalizedTemplates.set(eventType, {
      event_type: eventType,
      sendgrid_template_id: template.sendgridTemplateId.trim(),
      category: template.category,
      active: Boolean(template.active),
      description: template.description.trim() || null,
      subject_template: template.subjectTemplate.trim() || null,
      preheader_template: template.preheaderTemplate.trim() || null,
      body_template: normalizeBodyTemplate(template.bodyTemplate)
    })
  }

  const { error: prefError } = await supabase
    .from('mail_admin_copy_preferences')
    .upsert([{
      scope: 'global',
      critical_enabled: body.adminCopies.criticalEnabled,
      non_critical_enabled: body.adminCopies.nonCriticalEnabled,
      recipients
    }], { onConflict: 'scope' })

  if (prefError) throw createError({ statusCode: 500, statusMessage: prefError.message })

  const templates = [...normalizedTemplates.values()]
  const { data: existingTemplatesRaw, error: existingTemplatesError } = await supabase
    .from('mail_template_registry')
    .select('event_type')

  if (existingTemplatesError) {
    throw createError({ statusCode: 500, statusMessage: existingTemplatesError.message })
  }

  if (templates.length > 0) {
    const { error: templatesError } = await supabase
      .from('mail_template_registry')
      .upsert(templates, { onConflict: 'event_type' })

    if (templatesError) throw createError({ statusCode: 500, statusMessage: templatesError.message })
  }

  const incomingEventTypes = new Set(templates.map(template => template.event_type))
  const eventTypesToDelete = (existingTemplatesRaw ?? [])
    .map((row: { event_type: string }) => row.event_type)
    .filter((eventType: string) => !excludedEventTypes.has(eventType))
    .filter((eventType: string) => !incomingEventTypes.has(eventType))

  if (eventTypesToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('mail_template_registry')
      .delete()
      .in('event_type', eventTypesToDelete)

    if (deleteError) throw createError({ statusCode: 500, statusMessage: deleteError.message })
  }

  return { ok: true }
})
