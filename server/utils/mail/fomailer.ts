import { getRequestURL, type H3Event } from 'h3'
import { getKey, getServerConfig } from '~~/server/utils/config/secret'

type MailServerConfig = {
  url?: string
  host?: string
}

type FomailerLegacyBody = {
  type: string
  payload: Record<string, unknown>
}

type FomailerRequest = {
  endpoint?: string
  body: Record<string, unknown>
  headers?: Record<string, string>
}

const FOMAILER_NATIVE_TYPES = new Set([
  'account.signup',
  'booking.guestConfirmed',
  'booking.endingSoonReminder',
  'booking.memberCanceled',
  'booking.memberCreated',
  'booking.memberRescheduled',
  'billing.memberChargeReceipt',
  'contact.formSubmitted',
  'credits.topupPurchased',
  'holds.topupPurchased',
  'mailing.memberBroadcast',
  'membership.checkoutActivationPending',
  'membership.doorCodeUpdated',
  'membership.ended',
  'membership.pastDue',
  'membership.renewed',
  'membership.started',
  'membership.waitlistInvite'
])

export function resolveFomailerType(eventType: string | null | undefined) {
  const normalized = String(eventType ?? '').trim()
  if (FOMAILER_NATIVE_TYPES.has(normalized)) return normalized
  return 'mailing.memberBroadcast'
}

function resolveMailHost(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/+$/, '')
  if (raw && typeof raw === 'object') {
    const config = raw as MailServerConfig
    const candidate = config.url ?? config.host ?? null
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().replace(/\/+$/, '')
    }
  }
  return null
}

function resolveRequest(input: FomailerRequest | FomailerLegacyBody) {
  if ('body' in input) {
    return {
      endpoint: input.endpoint ?? '/api/mail/send',
      body: input.body,
      headers: input.headers ?? {}
    }
  }

  return {
    endpoint: '/api/mail/send',
    body: input,
    headers: {}
  }
}

function resolveEndpoint(mailHost: string, endpoint: string) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint
  const normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${mailHost}${normalized}`
}

function enrichPayload(event: H3Event, payload: Record<string, unknown>) {
  const origin = getRequestURL(event).origin
  return {
    supportEmail: 'hello@fo.studio',
    dashboardUrl: `${origin}/dashboard`,
    bookUrl: `${origin}/dashboard/book`,
    membershipUrl: `${origin}/dashboard/membership`,
    membershipsPublicUrl: `${origin}/memberships`,
    waiverUrl: `${origin}/dashboard/waiver`,
    creditsUrl: `${origin}/dashboard/credits`,
    manageUrl: `${origin}/dashboard/bookings`,
    calendarUrl: `${origin}/calendar`,
    studioAddress: '3131 N. San Fernando Rd., Los Angeles, CA 90065',
    ...payload
  }
}

function enrichRequestBody(event: H3Event, body: Record<string, unknown>) {
  const payload = body.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return body
  return {
    ...body,
    payload: enrichPayload(event, payload as Record<string, unknown>)
  }
}

export async function sendViaFomailer(event: H3Event, input: FomailerRequest | FomailerLegacyBody) {
  const rawMailHost = await getServerConfig(event, 'MAIL_SERVER_CONFIG').catch(() => null)
  const mailHost = resolveMailHost(rawMailHost)
  if (!mailHost) {
    return { ok: false, reason: 'missing_mail_server_config' as const }
  }

  const mailApiKey = await getKey(event, 'MAIL_SERVER_API_KEY').catch(() => null)
  if (!mailApiKey || typeof mailApiKey !== 'string') {
    return { ok: false, reason: 'missing_mail_server_api_key' as const }
  }

  const request = resolveRequest(input)
  const data = await $fetch(resolveEndpoint(mailHost, request.endpoint), {
    method: 'POST',
    headers: {
      'x-mail-key': mailApiKey,
      ...request.headers
    },
    body: enrichRequestBody(event, request.body)
  })

  return { ok: true as const, data }
}
