import { DateTime } from 'luxon'
import { requireServerAdmin } from '~~/server/utils/auth'
import { parsePeerspaceEventDetails } from '~~/server/utils/access/peerspace'
import { getServerConfigMap } from '~~/server/utils/config/secret'

type LinkRow = {
  id: string
  booking_id: string
  provider: 'peerspace' | 'manual'
  external_calendar_event_id: string | null
  external_reference: string | null
  manage_url: string | null
  delivery_status: 'pending' | 'shared' | 'not_required'
  shared_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type BookingRow = {
  id: string
  guest_name: string | null
  guest_email: string | null
  start_time: string
  end_time: string
  status: string
  notes: string | null
}

type AccessCodeRow = {
  booking_id: string
  id: string
  pin_code: string | null
  status: string
  valid_from: string
  valid_until: string
  slot_assignment_id: string | null
}

type ExternalEventRow = {
  id: string
  title: string | null
  description: string | null
  start_time: string
  end_time: string
  status: string
  active: boolean
}

function asBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function isMissingRelationError(error: { code?: string, message?: string } | null | undefined) {
  const message = String(error?.message ?? '').toLowerCase()
  return error?.code === '42P01'
    || message.includes('schema cache')
    || (message.includes('booking_external_access') && message.includes('does not exist'))
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  // Generated types cannot include this additive table until the migration is deployed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const nowIso = new Date().toISOString()
  const eventHorizonIso = DateTime.now().plus({ years: 1 }).toUTC().toISO() ?? nowIso

  const [{ data: linksData, error: linksError }, config] = await Promise.all([
    db
      .from('booking_external_access')
      .select('id,booking_id,provider,external_calendar_event_id,external_reference,manage_url,delivery_status,shared_at,metadata,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(500),
    getServerConfigMap(event, ['peerspace_access_auto_provision_enabled'])
  ])

  if (linksError) {
    if (isMissingRelationError(linksError)) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Scheduled access is not ready until the booking_external_access migration is applied.'
      })
    }
    throw createError({ statusCode: 500, statusMessage: linksError.message })
  }

  const links = (linksData ?? []) as LinkRow[]
  const bookingIds = links.map(row => row.booking_id)
  const linkedEventIds = links
    .map(row => row.external_calendar_event_id)
    .filter((value): value is string => Boolean(value))

  const [bookingsRes, codesRes, linkedEventsRes, candidateEventsRes] = await Promise.all([
    bookingIds.length
      ? db
          .from('bookings')
          .select('id,guest_name,guest_email,start_time,end_time,status,notes')
          .in('id', bookingIds)
      : Promise.resolve({ data: [] as BookingRow[], error: null }),
    bookingIds.length
      ? db
          .from('booking_access_codes')
          .select('booking_id,id,pin_code,status,valid_from,valid_until,slot_assignment_id')
          .in('booking_id', bookingIds)
          .eq('code_type', 'guest')
      : Promise.resolve({ data: [] as AccessCodeRow[], error: null }),
    linkedEventIds.length
      ? db
          .from('external_calendar_events')
          .select('id,title,description,start_time,end_time,status,active')
          .in('id', linkedEventIds)
      : Promise.resolve({ data: [] as ExternalEventRow[], error: null }),
    db
      .from('external_calendar_events')
      .select('id,title,description,start_time,end_time,status,active')
      .eq('active', true)
      .gt('end_time', nowIso)
      .lt('start_time', eventHorizonIso)
      .order('start_time', { ascending: true })
  ])

  for (const result of [bookingsRes, codesRes, linkedEventsRes, candidateEventsRes]) {
    if (result.error) throw createError({ statusCode: 500, statusMessage: result.error.message })
  }

  const codeRows = (codesRes.data ?? []) as AccessCodeRow[]
  const assignmentIds = codeRows
    .map(row => row.slot_assignment_id)
    .filter((value): value is string => Boolean(value))
  const { data: assignmentsData, error: assignmentsError } = assignmentIds.length
    ? await db
        .from('lock_slot_assignments')
        .select('id,slot_number')
        .in('id', assignmentIds)
    : { data: [] as Array<{ id: string, slot_number: number }>, error: null }

  if (assignmentsError) throw createError({ statusCode: 500, statusMessage: assignmentsError.message })

  const bookingById = new Map(((bookingsRes.data ?? []) as BookingRow[]).map(row => [row.id, row]))
  const codeByBookingId = new Map(codeRows.map(row => [row.booking_id, row]))
  const eventById = new Map(((linkedEventsRes.data ?? []) as ExternalEventRow[]).map(row => [row.id, row]))
  const slotByAssignmentId = new Map((assignmentsData ?? []).map((row: { id: string, slot_number: number }) => [row.id, row.slot_number]))

  const records = links
    .map((link) => {
      const booking = bookingById.get(link.booking_id)
      if (!booking) return null
      const code = codeByBookingId.get(link.booking_id) ?? null
      const externalEvent = link.external_calendar_event_id
        ? eventById.get(link.external_calendar_event_id) ?? null
        : null

      return {
        id: link.id,
        bookingId: link.booking_id,
        provider: link.provider,
        externalCalendarEventId: link.external_calendar_event_id,
        externalReference: link.external_reference,
        manageUrl: link.manage_url,
        deliveryStatus: link.delivery_status,
        sharedAt: link.shared_at,
        guestName: booking.guest_name,
        guestEmail: booking.guest_email,
        startTime: booking.start_time,
        endTime: booking.end_time,
        bookingStatus: booking.status,
        notes: booking.notes,
        adminNotes: typeof link.metadata?.adminNotes === 'string' ? link.metadata.adminNotes : null,
        codeId: code?.id ?? null,
        pinCode: code?.pin_code ?? null,
        codeStatus: code?.status ?? null,
        validFrom: code?.valid_from ?? null,
        validUntil: code?.valid_until ?? null,
        slotNumber: code?.slot_assignment_id ? slotByAssignmentId.get(code.slot_assignment_id) ?? null : null,
        externalEventTitle: externalEvent?.title ?? null,
        createdAt: link.created_at,
        updatedAt: link.updated_at
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = Date.parse(left!.startTime)
      const rightTime = Date.parse(right!.startTime)
      const now = Date.now()
      const leftUpcoming = Date.parse(left!.endTime) > now
      const rightUpcoming = Date.parse(right!.endTime) > now
      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1
      return leftUpcoming ? leftTime - rightTime : rightTime - leftTime
    })

  const linkByEventId = new Map(links
    .filter(row => row.external_calendar_event_id)
    .map(row => [row.external_calendar_event_id as string, row]))

  const eventOptions = ((candidateEventsRes.data ?? []) as ExternalEventRow[])
    .map((row) => {
      const details = parsePeerspaceEventDetails(row)
      if (!details.isPeerspace) return null
      const linked = linkByEventId.get(row.id) ?? null
      return {
        id: row.id,
        title: row.title,
        guestName: details.guestName,
        externalReference: details.externalReference,
        manageUrl: details.manageUrl,
        startTime: row.start_time,
        endTime: row.end_time,
        linkedRecordId: linked?.id ?? null,
        linkedBookingId: linked?.booking_id ?? null
      }
    })
    .filter(Boolean)

  const activeStatuses = new Set(['confirmed', 'requested'])
  const upcomingRecords = records.filter(row => row && activeStatuses.has(String(row.bookingStatus).toLowerCase()) && Date.parse(row.endTime) > Date.now())

  return {
    records,
    eventOptions,
    settings: {
      autoProvisionEnabled: asBoolean(config.peerspace_access_auto_provision_enabled, true)
    },
    summary: {
      upcoming: upcomingRecords.length,
      needsSharing: upcomingRecords.filter(row => row?.deliveryStatus === 'pending').length,
      activeNow: upcomingRecords.filter(row => row?.codeStatus === 'active').length
    }
  }
})
