import { DateTime } from 'luxon'
import { getRequestURL } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'

const STUDIO_TZ = 'America/Los_Angeles'
const STUDIO_ADDRESS = '3131 N. San Fernando Rd., Los Angeles, CA 90065'

export type MemberBookingLifecycleEventType = 'booking.memberCreated'
  | 'booking.memberRescheduled'
  | 'booking.memberCanceled'

type SendMemberBookingLifecycleMailInput = {
  eventType: MemberBookingLifecycleEventType
  userId: string
  bookingId: string
  bookingStart: string
  bookingEnd: string
  previousBookingStart?: string | null
  previousBookingEnd?: string | null
  creditsBurned?: number | null
  creditsDelta?: number | null
  creditsRefunded?: number | null
  holdRequested?: boolean
  holdCreated?: boolean
  holdKept?: boolean
  holdRemoved?: boolean
  actionedBy?: 'member' | 'admin'
}

type MailTemplateRegistryRow = {
  event_type: string
  sendgrid_template_id: string
  active: boolean
}

type CustomerRow = {
  first_name: string | null
  last_name: string | null
  email: string | null
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized || null
}

function formatLocalDateTime(value: string | null | undefined) {
  if (!value) return ''
  const parsed = DateTime.fromISO(value, { setZone: true }).setZone(STUDIO_TZ)
  if (!parsed.isValid) return value
  return parsed.toFormat('ccc, LLL d, yyyy \'at\' h:mm a z')
}

function formatCredits(value: number | null | undefined) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric)) return '0'
  if (Number.isInteger(numeric)) return String(numeric)
  return numeric.toFixed(2).replace(/\.?0+$/, '')
}

function resolveHoldStatus(input: SendMemberBookingLifecycleMailInput) {
  if (input.holdRemoved) return 'Overnight hold removed'
  if (input.holdCreated) return 'Overnight hold enabled'
  if (input.holdKept) return 'Overnight hold retained'
  if (input.holdRequested) return 'Overnight hold requested'
  return 'No overnight hold'
}

export async function sendMemberBookingLifecycleMail(event: H3Event, input: SendMemberBookingLifecycleMailInput) {
  try {
    const supabase = serverSupabaseServiceRole(event)

    const { data: templateRowRaw, error: templateErr } = await supabase
      .from('mail_template_registry')
      .select('event_type,sendgrid_template_id,active')
      .eq('event_type', input.eventType)
      .maybeSingle()

    if (templateErr) {
      console.warn('[mail/booking-lifecycle] failed to lookup template row', {
        eventType: input.eventType,
        bookingId: input.bookingId,
        message: templateErr.message
      })
      return { ok: false, reason: 'template_lookup_failed' as const }
    }

    const templateRow = (templateRowRaw ?? null) as MailTemplateRegistryRow | null
    const templateId = String(templateRow?.sendgrid_template_id ?? '').trim()
    if (!templateId) {
      return { ok: false, reason: 'template_id_missing' as const }
    }
    if (templateRow?.active === false) {
      return { ok: false, reason: 'template_inactive' as const }
    }

    const { data: customerRaw, error: customerErr } = await supabase
      .from('customers')
      .select('first_name,last_name,email')
      .eq('user_id', input.userId)
      .maybeSingle()

    if (customerErr) {
      console.warn('[mail/booking-lifecycle] failed to lookup customer row', {
        eventType: input.eventType,
        bookingId: input.bookingId,
        userId: input.userId,
        message: customerErr.message
      })
      return { ok: false, reason: 'customer_lookup_failed' as const }
    }

    const customer = (customerRaw ?? null) as CustomerRow | null
    const to = normalizeEmail(customer?.email)
    if (!to) {
      return { ok: false, reason: 'recipient_missing' as const }
    }

    const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ').trim() || 'Member'
    const origin = getRequestURL(event).origin
    const payload = {
      to,
      userId: input.userId,
      eventType: input.eventType,
      templateId,
      customerName,
      customerEmail: to,
      bookingId: input.bookingId,
      bookingStart: input.bookingStart,
      bookingEnd: input.bookingEnd,
      bookingStartHuman: formatLocalDateTime(input.bookingStart),
      bookingEndHuman: formatLocalDateTime(input.bookingEnd),
      previousBookingStart: input.previousBookingStart ?? '',
      previousBookingEnd: input.previousBookingEnd ?? '',
      previousBookingStartHuman: formatLocalDateTime(input.previousBookingStart ?? ''),
      previousBookingEndHuman: formatLocalDateTime(input.previousBookingEnd ?? ''),
      creditsBurned: formatCredits(input.creditsBurned ?? 0),
      creditsDelta: formatCredits(input.creditsDelta ?? 0),
      creditsRefunded: formatCredits(input.creditsRefunded ?? 0),
      holdRequested: Boolean(input.holdRequested),
      holdCreated: Boolean(input.holdCreated),
      holdKept: Boolean(input.holdKept),
      holdRemoved: Boolean(input.holdRemoved),
      holdStatus: resolveHoldStatus(input),
      actionedBy: input.actionedBy === 'admin' ? 'admin' : 'member',
      manageUrl: `${origin}/dashboard/bookings`,
      calendarUrl: `${origin}/calendar`,
      studioAddress: STUDIO_ADDRESS
    }

    const sendResult = await sendViaFomailer(event, {
      type: input.eventType,
      payload
    })

    if (!sendResult.ok) {
      console.warn('[mail/booking-lifecycle] send skipped', {
        eventType: input.eventType,
        bookingId: input.bookingId,
        reason: sendResult.reason
      })
      return { ok: false, reason: sendResult.reason ?? 'send_failed' as const }
    }

    return { ok: true as const }
  } catch (error: unknown) {
    console.warn('[mail/booking-lifecycle] send failed', {
      eventType: input.eventType,
      bookingId: input.bookingId,
      message: error instanceof Error ? error.message : String(error)
    })
    return { ok: false, reason: 'exception' as const }
  }
}
