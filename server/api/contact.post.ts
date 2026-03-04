import { z } from 'zod'

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  subject: z.string().trim().min(5).max(160),
  message: z.string().trim().min(10).max(5000),
  company: z.string().trim().max(200).optional().or(z.literal(''))
})

type ContactPayload = z.infer<typeof contactSchema>

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(/'/g, '&#39;')
}

function toPlainText(body: ContactPayload) {
  return [
    'New FO Studio contact request',
    '',
    `Name: ${body.name}`,
    `Email: ${body.email}`,
    `Phone: ${body.phone || 'Not provided'}`,
    `Subject: ${body.subject}`,
    '',
    'Message:',
    body.message
  ].join('\n')
}

function toHtml(body: ContactPayload) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#282828;">
      <h2 style="margin:0 0 16px;">New FO Studio contact request</h2>
      <p><strong>Name:</strong> ${escapeHtml(body.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(body.email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(body.phone || 'Not provided')}</p>
      <p><strong>Subject:</strong> ${escapeHtml(body.subject)}</p>
      <p><strong>Message:</strong></p>
      <div style="white-space:pre-wrap;border:1px solid #d5c4a1;border-radius:12px;padding:12px;background:#fbf1c7;">
        ${escapeHtml(body.message)}
      </div>
    </div>
  `
}

async function sendViaResend(config: ReturnType<typeof useRuntimeConfig>, body: ContactPayload) {
  if (!config.resendApiKey || !config.contactToEmail) {
    return false
  }

  await $fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`
    },
    body: {
      from: config.contactFromEmail,
      to: [config.contactToEmail],
      reply_to: body.email,
      subject: `FO Studio contact: ${body.subject}`,
      text: toPlainText(body),
      html: toHtml(body)
    }
  })

  return true
}

async function sendViaWebhook(config: ReturnType<typeof useRuntimeConfig>, body: ContactPayload) {
  if (!config.contactWebhookUrl) {
    return false
  }

  await $fetch(config.contactWebhookUrl, {
    method: 'POST',
    body: {
      source: 'fostudio-contact-form',
      submittedAt: new Date().toISOString(),
      ...body
    }
  })

  return true
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
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

  try {
    const sentByResend = await sendViaResend(config, body)
    if (sentByResend) return { ok: true, delivery: 'resend' }

    const sentByWebhook = await sendViaWebhook(config, body)
    if (sentByWebhook) return { ok: true, delivery: 'webhook' }
  } catch (error) {
    console.error('Contact form delivery failed', error)
    throw createError({
      statusCode: 502,
      statusMessage: 'Contact delivery failed. Please try again in a moment.'
    })
  }

  throw createError({
    statusCode: 503,
    statusMessage: 'Contact form is not configured yet. Please add a delivery method first.'
  })
})
