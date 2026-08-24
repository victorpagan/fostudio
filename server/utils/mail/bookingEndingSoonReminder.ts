import { createHash } from 'node:crypto'
import { getRequestURL, type H3Event } from 'h3'
import { DateTime } from 'luxon'
import { serverSupabaseServiceRole } from '#supabase/server'
import { ACCESS_WINDOW_TRAIL_MINUTES } from '~~/server/utils/access/policy'
import { loadGuestBookingPolicy, validateGuestBookingWindow } from '~~/server/utils/booking/guestPolicy'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'
import { isMembershipCurrentlyActive } from '~~/server/utils/membership/status'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'

const EVENT_TYPE = 'booking.endingSoonReminder'

type BookingRow = {
  id: string
  user_id: string | null
  status: string | null
  start_time: string
  end_time: string
  booking_rate_kind: string | null
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null
}

function formatLocalDateTime(value: string) {
  const parsed = DateTime.fromISO(value, { setZone: true }).setZone(STUDIO_TZ)
  return parsed.isValid
    ? parsed.toFormat('ccc, LLL d, yyyy \'at\' h:mm a z')
    : value
}

function deterministicOperationKey(bookingId: string, bookingEnd: string) {
  const bytes = createHash('sha256')
    .update(`${EVENT_TYPE}:${bookingId}:${bookingEnd}`)
    .digest()
    .subarray(0, 16)

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function timestampsMatch(left: string, right: string) {
  const leftTime = DateTime.fromISO(left, { setZone: true })
  const rightTime = DateTime.fromISO(right, { setZone: true })
  return leftTime.isValid && rightTime.isValid && leftTime.toMillis() === rightTime.toMillis()
}

export async function sendBookingEndingSoonReminderMail(event: H3Event, input: {
  bookingId: string
  expectedEndTime: string
  reminderMinutes: number
}) {
  const supabase = serverSupabaseServiceRole(event)
  const { data: bookingRaw, error: bookingError } = await supabase
    .from('bookings')
    .select('id,user_id,status,start_time,end_time,booking_rate_kind')
    .eq('id', input.bookingId)
    .maybeSingle()

  if (bookingError) throw new Error(`Booking reminder lookup failed: ${bookingError.message}`)
  const booking = (bookingRaw ?? null) as BookingRow | null
  if (!booking) return { ok: true, skipped: 'booking_missing', bookingId: input.bookingId }
  if (!timestampsMatch(input.expectedEndTime, booking.end_time)) {
    return { ok: true, skipped: 'booking_end_changed', bookingId: booking.id }
  }
  if (!booking.user_id) {
    return { ok: true, skipped: 'booking_has_no_account_owner', bookingId: booking.id }
  }
  if (!['confirmed', 'requested'].includes(String(booking.status ?? '').toLowerCase())) {
    return { ok: true, skipped: 'booking_not_reminder_eligible', bookingId: booking.id }
  }
  if (String(booking.booking_rate_kind ?? 'standard').toLowerCase() === 'standby') {
    return { ok: true, skipped: 'standby_booking_cannot_extend', bookingId: booking.id }
  }

  const now = DateTime.now().setZone(STUDIO_TZ)
  const start = DateTime.fromISO(booking.start_time, { setZone: true }).setZone(STUDIO_TZ)
  const end = DateTime.fromISO(booking.end_time, { setZone: true }).setZone(STUDIO_TZ)
  if (!start.isValid || !end.isValid || now < start || now >= end) {
    return { ok: true, skipped: 'booking_not_in_progress', bookingId: booking.id }
  }

  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('status,current_period_end,canceled_at')
    .eq('user_id', booking.user_id)
    .maybeSingle()
  if (membershipError) throw new Error(`Booking reminder membership lookup failed: ${membershipError.message}`)

  let extensionIncrementMinutes = 30
  if (!isMembershipCurrentlyActive(membership)) {
    const guestPolicy = await loadGuestBookingPolicy(event)
    extensionIncrementMinutes = guestPolicy.bookingIncrementMinutes
    const guestExtension = validateGuestBookingWindow({
      start,
      end: end.plus({ minutes: extensionIncrementMinutes }),
      now: start,
      policy: guestPolicy
    })
    if (!guestExtension.ok) {
      return {
        ok: true,
        skipped: 'guest_extension_window_closed',
        bookingId: booking.id,
        reason: guestExtension.message
      }
    }
  }

  const [{ data: customer, error: customerError }, { data: template, error: templateError }] = await Promise.all([
    supabase
      .from('customers')
      .select('first_name,email')
      .eq('user_id', booking.user_id)
      .maybeSingle(),
    supabase
      .from('mail_template_registry')
      .select('sendgrid_template_id,active')
      .eq('event_type', EVENT_TYPE)
      .maybeSingle()
  ])
  if (customerError) throw new Error(`Booking reminder customer lookup failed: ${customerError.message}`)
  if (templateError) throw new Error(`Booking reminder template lookup failed: ${templateError.message}`)
  if (template?.active === false) {
    return { ok: true, skipped: 'template_inactive', bookingId: booking.id }
  }

  const to = normalizeEmail(customer?.email)
  if (!to) return { ok: true, skipped: 'recipient_missing', bookingId: booking.id }
  const templateId = String(template?.sendgrid_template_id ?? '').trim()
  if (!templateId) throw new Error(`Booking reminder template is not configured for ${EVENT_TYPE}`)

  const origin = getRequestURL(event).origin
  const extendUrl = `${origin}/dashboard/bookings?extend=${encodeURIComponent(booking.id)}`
  const payload = {
    to,
    userId: booking.user_id,
    eventType: EVENT_TYPE,
    templateId,
    customerName: String(customer?.first_name ?? '').trim() || 'there',
    customerEmail: to,
    bookingId: booking.id,
    bookingStart: booking.start_time,
    bookingEnd: booking.end_time,
    bookingStartHuman: formatLocalDateTime(booking.start_time),
    bookingEndHuman: formatLocalDateTime(booking.end_time),
    accessEndsAt: end.plus({ minutes: ACCESS_WINDOW_TRAIL_MINUTES }).toUTC().toISO(),
    accessEndsAtHuman: formatLocalDateTime(end.plus({ minutes: ACCESS_WINDOW_TRAIL_MINUTES }).toUTC().toISO()!),
    minutesUntilEnd: input.reminderMinutes,
    extensionIncrementMinutes,
    extendUrl,
    manageUrl: `${origin}/dashboard/bookings`,
    calendarUrl: `${origin}/calendar`
  }

  const sendResult = await sendViaFomailer(event, {
    headers: {
      'x-idempotency-key': deterministicOperationKey(booking.id, booking.end_time)
    },
    body: {
      type: EVENT_TYPE,
      payload
    }
  })
  if (!sendResult.ok) {
    throw new Error(`Booking reminder send unavailable: ${sendResult.reason}`)
  }

  return {
    ok: true,
    action: 'booking_ending_reminder_sent',
    bookingId: booking.id,
    userId: booking.user_id,
    bookingEnd: booking.end_time,
    extensionIncrementMinutes,
    fomailer: sendResult.data
  }
}
