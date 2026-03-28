import { z } from 'zod'
import { getRequestURL } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'
import { buildAdminMailPayload, normalizeMailRecipient } from '~~/server/utils/mail/adminPayload'

const bodySchema = z.object({
  eventType: z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._-]+$/),
  recipient: z.string().trim().email().max(320).optional()
})

type MailTemplateRegistryRow = {
  event_type: string
  sendgrid_template_id: string
  active: boolean
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

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const recipient = normalizeMailRecipient(body.recipient) ?? normalizeMailRecipient(user.email)
  if (!recipient) {
    throw createError({ statusCode: 400, statusMessage: 'Recipient email is required' })
  }

  const { data: templateRowRaw, error: templateError } = await supabase
    .from('mail_template_registry')
    .select('event_type,sendgrid_template_id,active')
    .eq('event_type', body.eventType)
    .maybeSingle()

  if (templateError) throw createError({ statusCode: 500, statusMessage: templateError.message })

  const templateRow = (templateRowRaw ?? null) as MailTemplateRegistryRow | null
  const templateId = String(templateRow?.sendgrid_template_id ?? '').trim()
  if (!templateId) {
    throw createError({
      statusCode: 400,
      statusMessage: `No SendGrid template id configured for ${body.eventType}`
    })
  }

  const payload = buildAdminMailPayload({
    eventType: body.eventType,
    recipient,
    userId: user.sub ?? 'admin-test-user',
    templateId,
    origin: getRequestURL(event).origin
  })

  let sendResult: Awaited<ReturnType<typeof sendViaFomailer>>
  try {
    sendResult = await sendViaFomailer(event, {
      type: body.eventType,
      payload
    })
    if (!sendResult.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `Test send failed before upstream request: ${sendResult.reason}`
      })
    }
  } catch (error: unknown) {
    const details = readUpstreamErrorDetails(error)
    const parts = [
      'Test send failed upstream',
      details?.status ? `(status ${details.status})` : '',
      details?.message ?? (error instanceof Error ? error.message : String(error))
    ].filter(Boolean)
    const baseMessage = parts.join(': ')

    throw createError({
      statusCode: 502,
      statusMessage: details?.payloadText
        ? `${baseMessage} | body: ${details.payloadText}`
        : baseMessage
    })
  }

  return {
    ok: Boolean(sendResult.ok),
    eventType: body.eventType,
    recipient,
    isActive: templateRow?.active !== false,
    mailer: sendResult.ok ? sendResult.data : { reason: sendResult.reason ?? 'unknown' }
  }
})
