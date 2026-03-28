import { DateTime } from 'luxon'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { isAdminRole, readUserRole } from '~~/server/utils/auth'
import type { RoleCarrier } from '~~/server/utils/auth'

const ICS_PROD_ID = '-//FO Studio//Booking Export//EN'
const STUDIO_TIMEZONE = 'America/Los_Angeles'
const STUDIO_LOCATION = 'FO Studio, 3131 N. San Fernando Rd., Los Angeles, CA 90065'

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldIcsLine(line: string) {
  if (line.length <= 75) return line

  let remaining = line
  let folded = ''

  while (remaining.length > 75) {
    folded += `${remaining.slice(0, 75)}\r\n `
    remaining = remaining.slice(75)
  }

  return `${folded}${remaining}`
}

function toUtcIcsTimestamp(value: string) {
  const dt = DateTime.fromISO(value, { setZone: true })
  if (!dt.isValid) return null
  return dt.toUTC().toFormat('yyyyLLdd\'T\'HHmmss\'Z\'')
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const bookingId = getRouterParam(event, 'id')
  if (!bookingId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing booking id' })
  }

  const role = readUserRole(user as RoleCarrier)
  const isAdmin = isAdminRole(role)
  const supabase = serverSupabaseServiceRole(event)

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id,user_id,status,start_time,end_time,notes')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })

  if (!isAdmin && booking.user_id !== user.sub) {
    throw createError({ statusCode: 403, statusMessage: 'Not your booking' })
  }

  const startUtc = toUtcIcsTimestamp(booking.start_time)
  const endUtc = toUtcIcsTimestamp(booking.end_time)
  if (!startUtc || !endUtc) {
    throw createError({ statusCode: 409, statusMessage: 'Booking has invalid start/end time' })
  }

  const bookingStatus = String(booking.status ?? '').toLowerCase()
  const title = bookingStatus === 'canceled'
    ? 'FO Studio Booking (Canceled)'
    : 'FO Studio Booking'
  const icsStatus = bookingStatus === 'canceled' ? 'CANCELLED' : 'CONFIRMED'
  const description = [
    'Booked via FO Studio dashboard.',
    `Status: ${booking.status ?? 'confirmed'}`,
    `Booking ID: ${booking.id}`,
    booking.notes ? `Notes: ${booking.notes}` : null
  ]
    .filter(Boolean)
    .join('\n')

  const dtStamp = DateTime.utc().toFormat('yyyyLLdd\'T\'HHmmss\'Z\'')
  const uid = `booking-${booking.id}@fo.studio`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PROD_ID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(STUDIO_LOCATION)}`,
    `STATUS:${icsStatus}`,
    `X-FO-STUDIO-TZ:${STUDIO_TIMEZONE}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ]

  const icsContent = `${lines.map(foldIcsLine).join('\r\n')}\r\n`
  const filename = `fo-studio-booking-${booking.id}.ics`

  setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  return icsContent
})
