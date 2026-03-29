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
const CONTACT_FALLBACK_EVENT_TYPE = 'mailing.memberBroadcast'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(/'/g, '&#39;')
}

function readUpstreamErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const value = error as {
    statusCode?: number
    statusMessage?: string
    data?: unknown
    response?: { status?: number, _data?: unknown }
    message?: string
  }

  const status = value.statusCode ?? value.response?.status ?? null
  const payload = value.data ?? value.response?._data ?? null
  const payloadText = payload == null
    ? null
    : (typeof payload === 'string' ? payload : JSON.stringify(payload))

  return {
    status,
    message: value.statusMessage ?? value.message ?? null,
    payloadText
  }
}

function shouldFallbackToBroadcast(error: unknown) {
  const details = readUpstreamErrorDetails(error)
  const corpus = [
    details?.message ?? '',
    details?.payloadText ?? ''
  ]
    .join(' ')
    .toLowerCase()

  return corpus.includes('unknown mail type') && corpus.includes(CONTACT_EVENT_TYPE.toLowerCase())
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
  const selectedRecipient = fallbackRecipient ?? prefRecipients[0] ?? null

  if (!selectedRecipient) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Contact form recipients are not configured yet.'
    })
  }

  const submittedAt = new Date().toISOString()
  const contactMessageEscaped = escapeHtml(body.message)
  const contactMessageHtml = contactMessageEscaped.replace(/\r?\n/g, '<br />')
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
    contactMessage: contactMessageEscaped
  }

  const fallbackBodyHtml = [
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">',
    '<h1 style="font-size:24px;margin:0 0 12px;">New contact request</h1>',
    '<p style="margin:0 0 14px;">A new website contact form submission was received.</p>',
    '<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">',
    `<p style="margin:0 0 8px;"><strong>Name:</strong> ${payloadBase.contactName}</p>`,
    `<p style="margin:0 0 8px;"><strong>Email:</strong> ${payloadBase.contactEmail}</p>`,
    `<p style="margin:0 0 8px;"><strong>Phone:</strong> ${payloadBase.contactPhone}</p>`,
    `<p style="margin:0;"><strong>Subject:</strong> ${payloadBase.contactSubject}</p>`,
    '</div>',
    '<p style="margin:0 0 8px;"><strong>Message</strong></p>',
    `<div style="white-space:normal;padding:12px 14px;border:1px solid #e5e5e5;border-radius:8px;background:#fff;">${contactMessageHtml}</div>`,
    '</div>'
  ].join('')

  let delivered = 0
  try {
    const primaryPayload = {
      ...payloadBase,
      to: selectedRecipient
    }

    try {
      const sendResult = await sendViaFomailer(event, {
        type: CONTACT_EVENT_TYPE,
        payload: primaryPayload
      })

      if (!sendResult.ok) {
        throw createError({
          statusCode: 502,
          statusMessage: `Contact delivery failed before upstream request: ${sendResult.reason}`
        })
      }

      delivered += 1
    } catch (primaryError) {
      if (!shouldFallbackToBroadcast(primaryError)) {
        throw primaryError
      }

      const fallbackResult = await sendViaFomailer(event, {
        type: CONTACT_FALLBACK_EVENT_TYPE,
        payload: {
          ...primaryPayload,
          skipRegistryCopyOverrides: true,
          subject: `Contact form: ${body.subject.trim()}`,
          preheader: `New contact request from ${body.name.trim()}.`,
          body: fallbackBodyHtml,
          bodyHtml: fallbackBodyHtml,
          bodyHTML: fallbackBodyHtml
        }
      })

      if (!fallbackResult.ok) {
        throw createError({
          statusCode: 502,
          statusMessage: `Contact fallback delivery failed before upstream request: ${fallbackResult.reason}`
        })
      }

      delivered += 1
    }
  } catch (error: unknown) {
    const details = readUpstreamErrorDetails(error)
    console.error('Contact form delivery failed', {
      status: details?.status ?? null,
      message: details?.message ?? (error instanceof Error ? error.message : String(error)),
      payload: details?.payloadText ?? null
    })

    const parts = [
      'Contact delivery failed',
      details?.status ? `(status ${details.status})` : '',
      details?.message ?? null
    ].filter(Boolean)

    throw createError({
      statusCode: 502,
      statusMessage: parts.length > 1
        ? `${parts.join(': ')}. Please try again in a moment.`
        : 'Contact delivery failed. Please try again in a moment.'
    })
  }

  return {
    ok: true,
    delivery: 'mail_registry',
    delivered
  }
})
