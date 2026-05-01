import { getRequestURL } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'

type MailTemplateRegistryRow = {
  event_type: string
  sendgrid_template_id: string
  active: boolean
}

type SupabaseSchemaDriftClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: unknown
          error: { message: string } | null
        }>
      }
    }
  }
}

type SendAccountSignupMailInput = {
  userId: string
  email: string
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  returnTo?: string | null
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized || null
}

function normalizeReturnTo(value: string | null | undefined) {
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/onboarding'
}

export async function sendAccountSignupMail(event: H3Event, input: SendAccountSignupMailInput) {
  const eventType = 'account.signup'
  try {
    const supabase = serverSupabaseServiceRole(event) as unknown as SupabaseSchemaDriftClient
    const { data: templateRowRaw, error: templateErr } = await supabase
      .from('mail_template_registry')
      .select('event_type,sendgrid_template_id,active')
      .eq('event_type', eventType)
      .maybeSingle()

    if (templateErr) {
      console.warn('[mail/account-signup] failed to lookup template row', {
        userId: input.userId,
        message: templateErr.message
      })
      return { ok: false, reason: 'template_lookup_failed' as const }
    }

    const templateRow = (templateRowRaw ?? null) as MailTemplateRegistryRow | null
    const templateId = String(templateRow?.sendgrid_template_id ?? '').trim()
    if (!templateId) return { ok: false, reason: 'template_id_missing' as const }
    if (templateRow?.active === false) return { ok: false, reason: 'template_inactive' as const }

    const to = normalizeEmail(input.email)
    if (!to) return { ok: false, reason: 'recipient_missing' as const }

    const firstName = String(input.firstName ?? '').trim()
    const lastName = String(input.lastName ?? '').trim()
    const customerName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'there'
    const origin = getRequestURL(event).origin
    const returnTo = normalizeReturnTo(input.returnTo)
    const onboardingUrl = `${origin}/onboarding?returnTo=${encodeURIComponent(returnTo)}`

    const sendResult = await sendViaFomailer(event, {
      type: eventType,
      payload: {
        to,
        userId: input.userId,
        eventType,
        templateId,
        customerName,
        customerEmail: to,
        firstName,
        lastName,
        phone: String(input.phone ?? '').trim(),
        loginUrl: `${origin}/login?returnTo=${encodeURIComponent(returnTo)}`,
        onboardingUrl,
        dashboardUrl: `${origin}/dashboard`,
        bookUrl: `${origin}/dashboard/book`,
        returnTo,
        accountCreatedAt: new Date().toISOString()
      }
    })

    if (!sendResult.ok) {
      console.warn('[mail/account-signup] send skipped', {
        userId: input.userId,
        reason: sendResult.reason
      })
      return { ok: false, reason: sendResult.reason ?? 'send_failed' as const }
    }

    return { ok: true as const }
  } catch (error: unknown) {
    console.warn('[mail/account-signup] send failed', {
      userId: input.userId,
      message: error instanceof Error ? error.message : String(error)
    })
    return { ok: false, reason: 'exception' as const }
  }
}
