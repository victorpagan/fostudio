import { z } from 'zod'
import { DateTime } from 'luxon'
import { requireServerAdmin } from '~~/server/utils/auth'
import { parsePeerspaceEventDetails } from '~~/server/utils/access/peerspace'
import { enqueueBookingAccessSync, processDueAccessJobs, upsertGuestAccessCode } from '~~/server/utils/access/jobs'
import { isInsideAccessWindow } from '~~/server/utils/access/policy'
import { getExternalCalendarEventsInRange } from '~~/server/utils/booking/externalCalendar'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  provider: z.enum(['peerspace', 'manual']).optional().default('peerspace'),
  externalCalendarEventId: z.string().uuid().optional().nullable(),
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.union([z.string().trim().email().max(254), z.literal('')]).optional().nullable(),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  externalReference: z.string().trim().max(120).optional().nullable(),
  manageUrl: z.string().trim().max(1000).optional().nullable(),
  pinCode: z.union([z.string().trim().regex(/^\d{6}$/), z.literal('')]).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable()
})

type LinkRow = {
  id: string
  booking_id: string
  external_calendar_event_id: string | null
  external_reference: string | null
  metadata: Record<string, unknown> | null
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

function normalizeReference(value: string | null | undefined) {
  const normalized = String(value ?? '').replace(/^,+/, '').trim().toUpperCase()
  return normalized || null
}

function normalizeNullable(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function validateManageUrl(value: string | null) {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol')
    return parsed.toString()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Manage URL must be a valid HTTP or HTTPS URL.' })
  }
}

function isConstraintConflict(error: unknown) {
  return ['23505', '23P01'].includes(String((error as { code?: unknown } | null)?.code ?? ''))
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function buildBookingNotes(reference: string | null, adminNotes: string | null) {
  return [
    reference ? `External confirmation: ${reference}` : 'External booking prepared by an administrator',
    adminNotes
  ].filter(Boolean).join('\n\n')
}

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireServerAdmin(event)
  // Generated types cannot include this additive table until the migration is deployed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))
  const nowIso = new Date().toISOString()

  const { data: existingLinkData, error: existingLinkError } = body.id
    ? await db
        .from('booking_external_access')
        .select('id,booking_id,external_calendar_event_id,external_reference,metadata')
        .eq('id', body.id)
        .maybeSingle()
    : { data: null, error: null }

  if (existingLinkError) throw createError({ statusCode: 500, statusMessage: existingLinkError.message })
  if (body.id && !existingLinkData) throw createError({ statusCode: 404, statusMessage: 'Scheduled access record not found.' })
  const existingLink = (existingLinkData as LinkRow | null) ?? null

  const { data: existingBookingData, error: existingBookingError } = existingLink
    ? await db
        .from('bookings')
        .select('id,guest_name,guest_email,start_time,end_time,status,notes')
        .eq('id', existingLink.booking_id)
        .maybeSingle()
    : { data: null, error: null }

  if (existingBookingError) throw createError({ statusCode: 500, statusMessage: existingBookingError.message })
  if (existingLink && !existingBookingData) throw createError({ statusCode: 409, statusMessage: 'The linked booking no longer exists.' })
  const existingBooking = (existingBookingData as BookingRow | null) ?? null

  const { data: existingCode, error: existingCodeError } = existingLink
    ? await db
        .from('booking_access_codes')
        .select('id,status,pin_code')
        .eq('booking_id', existingLink.booking_id)
        .eq('code_type', 'guest')
        .maybeSingle()
    : { data: null, error: null }

  if (existingCodeError) throw createError({ statusCode: 500, statusMessage: existingCodeError.message })
  if (String(existingCode?.status ?? '').toLowerCase() === 'active') {
    throw createError({
      statusCode: 409,
      statusMessage: 'This code is active at the studio. Revoke it before changing the reservation.'
    })
  }

  let startTime = body.startTime
  let endTime = body.endTime
  let guestName = body.guestName.trim()
  let externalReference = normalizeReference(body.externalReference)
  let manageUrl = validateManageUrl(normalizeNullable(body.manageUrl))
  let externalEventTitle: string | null = null

  if (body.externalCalendarEventId) {
    const { data: externalEvent, error: externalEventError } = await db
      .from('external_calendar_events')
      .select('id,title,description,start_time,end_time,status,active')
      .eq('id', body.externalCalendarEventId)
      .maybeSingle()

    if (externalEventError) throw createError({ statusCode: 500, statusMessage: externalEventError.message })
    if (!externalEvent || !externalEvent.active || ['canceled', 'cancelled'].includes(String(externalEvent.status).toLowerCase())) {
      throw createError({ statusCode: 409, statusMessage: 'The selected Peerspace calendar event is no longer active.' })
    }

    const details = parsePeerspaceEventDetails(externalEvent)
    if (!details.isPeerspace) {
      throw createError({ statusCode: 400, statusMessage: 'The selected calendar event is not recognized as a Peerspace booking.' })
    }

    const { data: eventLink, error: eventLinkError } = await db
      .from('booking_external_access')
      .select('id')
      .eq('external_calendar_event_id', body.externalCalendarEventId)
      .maybeSingle()

    if (eventLinkError) throw createError({ statusCode: 500, statusMessage: eventLinkError.message })
    if (eventLink?.id && eventLink.id !== existingLink?.id) {
      throw createError({ statusCode: 409, statusMessage: 'That Peerspace event already has a scheduled access code.' })
    }

    startTime = externalEvent.start_time
    endTime = externalEvent.end_time
    guestName = details.guestName ?? guestName
    externalReference = details.externalReference ?? externalReference
    manageUrl = details.manageUrl ?? manageUrl
    externalEventTitle = externalEvent.title ?? null
  }

  const start = DateTime.fromISO(startTime, { setZone: true })
  const end = DateTime.fromISO(endTime, { setZone: true })
  if (!start.isValid || !end.isValid || !(start < end)) {
    throw createError({ statusCode: 400, statusMessage: 'End time must be after start time.' })
  }
  if (end.toMillis() <= Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'Scheduled access must end in the future.' })
  }

  if (externalReference) {
    const { data: referenceLink, error: referenceLinkError } = await db
      .from('booking_external_access')
      .select('id')
      .in('provider', ['peerspace', 'manual'])
      .eq('external_reference', externalReference)
      .maybeSingle()
    if (referenceLinkError) throw createError({ statusCode: 500, statusMessage: referenceLinkError.message })
    if (referenceLink?.id && referenceLink.id !== existingLink?.id) {
      throw createError({
        statusCode: 409,
        statusMessage: `Confirmation ${externalReference} already has scheduled access. Edit that record or use Sync Peerspace to attach the calendar event.`
      })
    }
  }

  let localConflictQuery = db
    .from('bookings')
    .select('id,start_time,end_time')
    .in('status', ['confirmed', 'requested', 'pending_payment'])
    .lt('start_time', endTime)
    .gt('end_time', startTime)
    .limit(1)
  if (existingBooking?.id) localConflictQuery = localConflictQuery.neq('id', existingBooking.id)
  const { data: localConflict, error: localConflictError } = await localConflictQuery.maybeSingle()
  if (localConflictError) throw createError({ statusCode: 500, statusMessage: localConflictError.message })
  if (localConflict) throw createError({ statusCode: 409, statusMessage: 'This reservation overlaps an existing FO Studio booking.' })

  const { data: blockConflict, error: blockConflictError } = await db
    .from('calendar_blocks')
    .select('id')
    .eq('active', true)
    .lt('start_time', endTime)
    .gt('end_time', startTime)
    .limit(1)
    .maybeSingle()
  if (blockConflictError) throw createError({ statusCode: 500, statusMessage: blockConflictError.message })
  if (blockConflict) throw createError({ statusCode: 409, statusMessage: 'This reservation overlaps an admin studio block.' })

  const externalConflicts = await getExternalCalendarEventsInRange(supabase, startTime, endTime)
  const conflictingExternal = externalConflicts.find(row => row.id !== body.externalCalendarEventId)
  if (conflictingExternal) {
    throw createError({ statusCode: 409, statusMessage: 'This reservation overlaps another external calendar event.' })
  }

  const adminNotes = normalizeNullable(body.notes)
  const guestEmail = normalizeNullable(body.guestEmail)?.toLowerCase() ?? null
  const bookingValues = {
    user_id: null,
    customer_id: null,
    start_time: startTime,
    end_time: endTime,
    status: 'confirmed',
    guest_name: guestName,
    guest_email: guestEmail,
    notes: buildBookingNotes(externalReference, adminNotes),
    credits_estimated: 0,
    credits_burned: 0,
    credits_final: 0,
    booking_kind: 'standard',
    booking_rate_kind: 'standard',
    rate_policy_snapshot: {
      source: 'external_scheduled_access',
      provider: body.provider
    },
    updated_at: nowIso
  }

  let booking: BookingRow | null = null
  let createdBookingId: string | null = null

  try {
    if (existingBooking) {
      const { data, error } = await db
        .from('bookings')
        .update(bookingValues)
        .eq('id', existingBooking.id)
        .select('id,guest_name,guest_email,start_time,end_time,status,notes')
        .single()
      if (error) throw error
      booking = data as BookingRow
    } else {
      const { data, error } = await db
        .from('bookings')
        .insert({
          ...bookingValues,
          created_at: nowIso
        })
        .select('id,guest_name,guest_email,start_time,end_time,status,notes')
        .single()
      if (error) throw error
      booking = data as BookingRow
      createdBookingId = booking.id
    }

    const existingMetadata = asRecord(existingLink?.metadata)
    const requestedPin = normalizeNullable(body.pinCode)
    const existingPin = normalizeNullable(existingCode?.pin_code)
    const existingCodeStatus = String(existingCode?.status ?? '').toLowerCase()
    const codeWillChange = Boolean(existingLink) && (
      Boolean(requestedPin && requestedPin !== existingPin)
      || !['scheduled', 'active'].includes(existingCodeStatus)
    )
    const linkValues = {
      booking_id: booking.id,
      provider: body.provider,
      external_calendar_event_id: body.externalCalendarEventId ?? null,
      external_reference: externalReference,
      manage_url: manageUrl,
      ...(codeWillChange
        ? {
            delivery_status: 'pending',
            shared_at: null,
            shared_by: null
          }
        : {}),
      metadata: {
        ...existingMetadata,
        source: body.externalCalendarEventId ? 'admin_calendar_import' : 'admin_manual',
        adminNotes,
        externalEventTitle
      },
      updated_by: user.sub,
      updated_at: nowIso
    }

    let linkId = existingLink?.id ?? null
    if (existingLink) {
      const { error } = await db
        .from('booking_external_access')
        .update(linkValues)
        .eq('id', existingLink.id)
      if (error) throw error
    } else {
      const { data, error } = await db
        .from('booking_external_access')
        .insert({
          ...linkValues,
          delivery_status: 'pending',
          created_by: user.sub,
          created_at: nowIso
        })
        .select('id')
        .single()
      if (error) throw error
      linkId = String(data.id)
    }

    const accessCode = await upsertGuestAccessCode(event, {
      bookingId: booking.id,
      pinCode: requestedPin,
      source: body.provider === 'peerspace' ? 'peerspace_admin' : 'external_admin'
    })
    const queued = await enqueueBookingAccessSync(event, {
      bookingId: booking.id,
      reason: existingLink ? 'scheduled_external_booking_updated' : 'scheduled_external_booking_created'
    })

    const processorResult = isInsideAccessWindow(startTime, endTime)
      ? await processDueAccessJobs(event, { limit: 20 })
      : null

    return {
      ok: true,
      recordId: linkId,
      bookingId: booking.id,
      pinCode: accessCode.pinCode,
      validFrom: accessCode.validFrom,
      validUntil: accessCode.validUntil,
      queued,
      processorResult
    }
  } catch (error) {
    if (createdBookingId) {
      await db.from('bookings').delete().eq('id', createdBookingId).catch(() => null)
    }

    if (isConstraintConflict(error)) {
      throw createError({ statusCode: 409, statusMessage: 'This reservation or code conflicts with an existing booking.' })
    }
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({
      statusCode: 500,
      statusMessage: (error as { message?: string } | null)?.message ?? 'Could not save scheduled access.'
    })
  }
})
