import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getRegisteredMailEvents } from '~~/server/utils/mail/templateVariables'

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema)
]))

const jsonObjectSchema = z.record(z.string(), jsonValueSchema)

const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  status: z.enum(['draft', 'sent', 'archived']).default('draft'),
  templateId: z.string().uuid().nullable().optional(),
  eventType: z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._-]+$/).default('mailing.memberBroadcast'),
  sendgridTemplateId: z.string().trim().max(255).default(''),
  renderMode: z.enum(['editor_html', 'sendgrid_native']).default('editor_html'),
  subjectTemplate: z.string().max(300).default(''),
  preheaderTemplate: z.string().max(300).default(''),
  bodyTemplate: z.string().max(200_000).default(''),
  dynamicData: jsonObjectSchema.default({}),
  includeMembershipRecipients: z.coerce.boolean().default(true),
  additionalRecipients: z.array(z.string().trim().email().max(320)).max(1000).default([])
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

function normalizeBodyTemplate(value: string): string {
  if (!value.trim()) return ''
  return applyResponsiveImageStyles(value)
}

function normalizeDynamicValue(value: unknown): unknown {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeDynamicValue(item))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key.trim().length > 0)
        .map(([key, item]) => [key, normalizeDynamicValue(item)])
    )
  }
  return String(value)
}

function findUnsupportedTemplateSyntax(value: string): string | null {
  if (!value.trim()) return null

  if (/{{{\s*[^}]+\s*}}}/.test(value)) {
    return 'Triple-brace tokens are not supported in campaign copy. Use {{ variableName }} tokens only.'
  }
  if (/{{\s*[#/][^}]+}}/.test(value)) {
    return 'Handlebars control blocks (for example {{#if}}...{{/if}}) are not supported. Use plain {{ variableName }} tokens only.'
  }

  return null
}

type QueryResult = PromiseLike<{ data: unknown, error: { message: string } | null }>
type SelectEqBuilder = {
  maybeSingle: () => Promise<{ data: unknown, error: { message: string } | null }>
  order: (column: string, options?: { ascending?: boolean }) => {
    limit: (value: number) => {
      maybeSingle: () => Promise<{ data: unknown, error: { message: string } | null }>
    }
  }
}

type InsertBuilder = QueryResult & {
  select: (columns: string) => {
    maybeSingle: () => Promise<{ data: unknown, error: { message: string } | null }>
  }
}

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireServerAdmin(event)
  const db = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => SelectEqBuilder
      }
      update: (value: Record<string, unknown>) => {
        eq: (column: string, value: string) => {
          select: (columns: string) => {
            maybeSingle: () => Promise<{ data: unknown, error: { message: string } | null }>
          }
        }
      }
      insert: (values: Record<string, unknown>[]) => InsertBuilder
    }
  }

  const body = campaignSchema.parse(await readBody(event))
  const validEventTypes = new Set(getRegisteredMailEvents().map(item => item.eventType))
  if (!validEventTypes.has(body.eventType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Mail event type must be one of the registered values. Received: ${body.eventType}`
    })
  }

  const unsupportedSubject = findUnsupportedTemplateSyntax(body.subjectTemplate)
  if (unsupportedSubject) {
    throw createError({ statusCode: 400, statusMessage: `Campaign subject template: ${unsupportedSubject}` })
  }

  const unsupportedPreheader = findUnsupportedTemplateSyntax(body.preheaderTemplate)
  if (unsupportedPreheader) {
    throw createError({ statusCode: 400, statusMessage: `Campaign preheader template: ${unsupportedPreheader}` })
  }

  if (body.renderMode === 'editor_html') {
    const unsupportedBody = findUnsupportedTemplateSyntax(body.bodyTemplate)
    if (unsupportedBody) {
      throw createError({ statusCode: 400, statusMessage: `Campaign body template: ${unsupportedBody}` })
    }
  }

  const recipients = [...new Set(
    body.additionalRecipients
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  )]

  if (body.templateId) {
    const templateLookup = await db
      .from('mail_campaign_templates')
      .select('id')
      .eq('id', body.templateId)
      .maybeSingle()
    if (templateLookup.error) {
      throw createError({ statusCode: 500, statusMessage: `Could not validate template: ${templateLookup.error.message}` })
    }
    if (!templateLookup.data) {
      throw createError({ statusCode: 400, statusMessage: 'Selected campaign template does not exist.' })
    }
  }

  const payload = {
    name: body.name,
    status: body.status,
    template_id: body.templateId ?? null,
    event_type: body.eventType,
    sendgrid_template_id: body.sendgridTemplateId,
    render_mode: body.renderMode,
    subject_template: body.subjectTemplate,
    preheader_template: body.preheaderTemplate,
    body_template: normalizeBodyTemplate(body.bodyTemplate),
    dynamic_data_json: normalizeDynamicValue(body.dynamicData),
    include_membership_recipients: body.includeMembershipRecipients,
    additional_recipients: recipients
  } satisfies Record<string, unknown>

  async function appendTemplateIdHistoryIfNeeded(campaignId: string) {
    const nextTemplateId = String(body.sendgridTemplateId ?? '').trim()
    if (!nextTemplateId) return

    const latestHistoryResult = await db
      .from('mail_campaign_template_id_history')
      .select('template_id')
      .eq('campaign_id', campaignId)
      .order('saved_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestHistoryResult.error) {
      throw createError({
        statusCode: 500,
        statusMessage: `Could not read template id history: ${latestHistoryResult.error.message}`
      })
    }

    const latestTemplateId = String((latestHistoryResult.data as { template_id?: string } | null)?.template_id ?? '').trim()
    if (latestTemplateId === nextTemplateId) return

    const insertHistoryResult = await db
      .from('mail_campaign_template_id_history')
      .insert([{
        campaign_id: campaignId,
        template_id: nextTemplateId,
        saved_by: user.sub ?? null
      }])

    if (insertHistoryResult.error) {
      throw createError({
        statusCode: 500,
        statusMessage: `Could not write template id history: ${insertHistoryResult.error.message}`
      })
    }
  }

  if (body.id) {
    const updateResult = await db
      .from('mail_campaigns')
      .update(payload)
      .eq('id', body.id)
      .select('id,name,status,template_id,event_type,sendgrid_template_id,render_mode,subject_template,preheader_template,body_template,dynamic_data_json,include_membership_recipients,additional_recipients,last_send_summary,last_sent_at,created_by,created_at,updated_at')
      .maybeSingle()

    if (updateResult.error) {
      throw createError({ statusCode: 500, statusMessage: `Could not update campaign: ${updateResult.error.message}` })
    }

    if (!updateResult.data) {
      throw createError({ statusCode: 404, statusMessage: 'Campaign not found.' })
    }

    await appendTemplateIdHistoryIfNeeded(body.id)

    return { campaign: updateResult.data }
  }

  const insertResult = await db
    .from('mail_campaigns')
    .insert([{
      ...payload,
      created_by: user.sub ?? null
    }])
    .select('id,name,status,template_id,event_type,sendgrid_template_id,render_mode,subject_template,preheader_template,body_template,dynamic_data_json,include_membership_recipients,additional_recipients,last_send_summary,last_sent_at,created_by,created_at,updated_at')
    .maybeSingle()

  if (insertResult.error) {
    throw createError({ statusCode: 500, statusMessage: `Could not create campaign: ${insertResult.error.message}` })
  }

  const insertedCampaignId = String((insertResult.data as { id?: string } | null)?.id ?? '').trim()
  if (insertedCampaignId) {
    await appendTemplateIdHistoryIfNeeded(insertedCampaignId)
  }

  return { campaign: insertResult.data }
})
