import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { loadPeakWindowConfig, toPeakWindowPayload } from '~~/server/utils/booking/peak'
import { getExternalCalendarEventsInRange } from '~~/server/utils/booking/externalCalendar'
import { maybeAutoSyncGoogleCalendar } from '~~/server/utils/integrations/googleCalendar'

const qSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
})

function durationHours(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const hours = Math.max(0, (end - start) / 3600000)
  const rounded = Math.round(hours * 100) / 100
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function normalizeIso(value: string) {
  const parsed = DateTime.fromISO(value, { setZone: true })
  if (parsed.isValid) return parsed.toUTC().toISO()
  const sqlParsed = DateTime.fromSQL(value, { zone: 'utc' })
  if (sqlParsed.isValid) return sqlParsed.toUTC().toISO()
  return value
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const q = qSchema.parse(getQuery(event))
  const peakWindowConfig = await loadPeakWindowConfig(event)

  const now = new Date()
  const from = q.from ? new Date(q.from) : now
  const to = q.to ? new Date(q.to) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  try {
    await maybeAutoSyncGoogleCalendar(event, 'calendar_public')
  } catch (error) {
    console.error('[calendar/public] google sync failed', error)
  }

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status')
    .eq('status', 'confirmed')
    .lt('start_time', to.toISOString())
    .gt('end_time', from.toISOString())
    .order('start_time', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const { data: holds, error: holdsErr } = await supabase
    .from('booking_holds')
    .select('id, hold_start, hold_end')
    .lt('hold_start', to.toISOString())
    .gt('hold_end', from.toISOString())
    .order('hold_start', { ascending: true })

  if (holdsErr) throw createError({ statusCode: 500, statusMessage: holdsErr.message })

  const { data: blocks, error: blocksErr } = await supabase
    .from('calendar_blocks')
    .select('id,start_time,end_time,reason')
    .eq('active', true)
    .lt('start_time', to.toISOString())
    .gt('end_time', from.toISOString())
    .order('start_time', { ascending: true })

  if (blocksErr) throw createError({ statusCode: 500, statusMessage: blocksErr.message })

  let externalEvents: Array<{
    id: string
    title: string | null
    description: string | null
    location: string | null
    start_time: string
    end_time: string
    provider: string
    calendar_id: string
  }> = []

  try {
    const serviceRole = serverSupabaseServiceRole(event) as any
    externalEvents = await getExternalCalendarEventsInRange(
      serviceRole,
      from.toISOString(),
      to.toISOString()
    )
  } catch (error) {
    console.error('[calendar/public] failed to load external calendar events', error)
  }

  const events = [
    ...(bookings ?? []).map(b => ({
      id: `b_${b.id}`,
      start: normalizeIso(b.start_time),
      end: normalizeIso(b.end_time),
      title: `Member booked · ${durationHours(b.start_time, b.end_time)}h`,
      display: 'auto',
      color: '#64748b', // slate — neutral, no info leak
      extendedProps: { type: 'booking' }
    })),
    ...(holds ?? []).map(h => ({
      id: `h_${h.id}`,
      start: normalizeIso(h.hold_start),
      end: normalizeIso(h.hold_end),
      title: 'Hold',
      display: 'auto',
      color: '#f59e0b',
      extendedProps: { type: 'hold' }
    })),
    ...(blocks ?? []).map(block => ({
      id: `x_${block.id}`,
      start: normalizeIso(block.start_time),
      end: normalizeIso(block.end_time),
      title: block.reason || 'Studio block',
      display: 'background',
      color: '#dc2626',
      extendedProps: { type: 'hold' }
    })),
    ...externalEvents.map((ext) => ({
      id: `g_${ext.id}`,
      start: normalizeIso(ext.start_time),
      end: normalizeIso(ext.end_time),
      title: ext.title || 'External booking',
      display: 'auto',
      color: '#111827',
      extendedProps: {
        type: 'external',
        provider: ext.provider,
        location: ext.location
      }
    }))
  ]

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    peakWindow: toPeakWindowPayload(peakWindowConfig, null),
    events
  }
})
