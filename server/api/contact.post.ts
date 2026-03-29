import { z } from 'zod'
import { serverSupabaseServiceRole } from '#supabase/server'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'
import { normalizeMailRecipient } from '~~/server/utils/mail/adminPayload'

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  subject: z.string().trim().min(5).max(160),
  message: z.string().trim().min(10).max(5000),
  company: z.string().trim().max(200).optional().or(z.literal(''))
})

type MailTemplateRegistryRow = {
  event_type: string
  sendgrid_template_id: string
  active: boolean
}
type MailAdminCopyPreferencesRow = {
  recipients: string[] | null
}

const CONTACT_EVENT_TYPE = 'contact.formSubmitted'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(/'/g, '&#39;')
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const supabase = serverSupabaseServiceRole(event)
  const parsed = contactSchema.safeParse(await readBody(event))

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid contact form payload',
      data: parsed.error.flatten()
    })
  }

  const body = parsed.data

  // Hidden honeypot field for basic bot filtering.
  if (body.company) {
    return { ok: true }
  }

  const [{ data: templateRowRaw, error: templateError }, { data: prefRowRaw, error: prefError }] = await Promise.all([
    supabase
      .from('mail_template_registry')
      .select('event_type,sendgrid_template_id,active')
      .eq('event_type', CONTACT_EVENT_TYPE)
      .maybeSingle(),
    supabase
      .from('mail_admin_copy_preferences')
      .select('recipients')
      .eq('scope', 'global')
      .maybeSingle()
  ])

  if (templateError) {
    throw createError({
      statusCode: 500,
      statusMessage: `Could not load contact mail template: ${templateError.message}`
    })
  }
  if (prefError) {
    throw createError({
      statusCode: 500,
      statusMessage: `Could not load admin mail recipients: ${prefError.message}`
    })
  }

  const templateRow = (templateRowRaw ?? null) as MailTemplateRegistryRow | null
  const templateId = String(templateRow?.sendgrid_template_id ?? '').trim()
  if (!templateId) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Contact form email template is not configured yet.'
    })
  }
  if (templateRow?.active === false) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Contact form email delivery is temporarily disabled.'
    })
  }

  const prefRow = (prefRowRaw ?? null) as MailAdminCopyPreferencesRow | null
  const prefRecipients = Array.isArray(prefRow?.recipients)
    ? prefRow.recipients.map(value => normalizeMailRecipient(value)).filter(Boolean) as string[]
    : []
  const fallbackRecipient = normalizeMailRecipient(config.contactToEmail as string | undefined)
  const recipients = [...new Set([
    ...prefRecipients,
    ...(fallbackRecipient ? [fallbackRecipient] : [])
  ])]

  if (recipients.length === 0) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Contact form recipients are not configured yet.'
    })
  }

  const submittedAt = new Date().toISOString()
  const payloadBase = {
    eventType: CONTACT_EVENT_TYPE,
    templateId,
    source: 'site.contact',
    submittedAt,
    replyTo: body.email.trim().toLowerCase(),
    contactName: escapeHtml(body.name),
    contactEmail: escapeHtml(body.email.trim().toLowerCase()),
    contactPhone: escapeHtml(body.phone || 'Not provided'),
    contactSubject: escapeHtml(body.subject),
    contactMessage: escapeHtml(body.message)
  }

  let delivered = 0
  try {
    for (const recipient of recipients) {
      const sendResult = await sendViaFomailer(event, {
        type: CONTACT_EVENT_TYPE,
        payload: {
          ...payloadBase,
          to: recipient
        }
      })

      if (!sendResult.ok) {
        throw createError({
          statusCode: 502,
          statusMessage: `Contact delivery failed before upstream request: ${sendResult.reason}`
        })
      }

      delivered += 1
    }
  } catch (error) {
    console.error('Contact form delivery failed', error)
    throw createError({
      statusCode: 502,
      statusMessage: 'Contact delivery failed. Please try again in a moment.'
    })
  }

  return {
    ok: true,
    delivery: 'mail_registry',
    delivered
  }
})
