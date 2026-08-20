import { DateTime } from 'luxon'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'
import { createAccessIncident } from '~~/server/utils/access/incidents'
import { computeAccessWindow } from '~~/server/utils/access/policy'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'
import { getServerConfigMap } from '~~/server/utils/config/secret'
import {
  getPeerspaceReferenceMatches,
  parsePeerspaceEventDetails
} from '~~/server/utils/access/peerspace'

type ExternalCalendarEventRow = {
  id: string
  title: string | null
  description: string | null
  status: string
  start_time: string
  end_time: string
  active: boolean
  raw_payload: Record<string, unknown> | null
}

type ExternalAccessRow = {
  id: string
  booking_id: string
  provider: 'peerspace' | 'manual'
  external_calendar_event_id: string | null
  external_reference: string | null
  manage_url: string | null
  delivery_status: 'pending' | 'shared' | 'not_required'
  metadata: Record<string, unknown> | null
}

type LinkedBookingRow = {
  id: string
  guest_name: string | null
  start_time: string
  end_time: string
  status: string
  notes: string | null
}

function asBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function bookingNeedsUpdate(booking: LinkedBookingRow, event: ExternalCalendarEventRow, guestName: string | null) {
  return Date.parse(booking.start_time) !== Date.parse(event.start_time)
    || Date.parse(booking.end_time) !== Date.parse(event.end_time)
    || String(booking.status).toLowerCase() !== 'confirmed'
    || (guestName && booking.guest_name !== guestName)
}

function buildGeneratedNotes(reference: string | null) {
  return reference ? `Peerspace confirmation: ${reference}` : 'Peerspace booking imported from Google Calendar'
}

async function assertNoExternalProvisioningConflict(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  calendarEvent: ExternalCalendarEventRow
) {
  const [blockConflictRes, externalConflictRes] = await Promise.all([
    db
      .from('calendar_blocks')
      .select('id')
      .eq('active', true)
      .lt('start_time', calendarEvent.end_time)
      .gt('end_time', calendarEvent.start_time)
      .limit(1)
      .maybeSingle(),
    db
      .from('external_calendar_events')
      .select('id,title')
      .eq('active', true)
      .neq('id', calendarEvent.id)
      .lt('start_time', calendarEvent.end_time)
      .gt('end_time', calendarEvent.start_time)
      .limit(1)
      .maybeSingle()
  ])

  if (blockConflictRes.error) throw new Error(blockConflictRes.error.message)
  if (externalConflictRes.error) throw new Error(externalConflictRes.error.message)
  if (blockConflictRes.data?.id) {
    throw new Error('Peerspace reservation overlaps an active admin studio block; access was not provisioned')
  }
  if (externalConflictRes.data?.id) {
    throw new Error(`Peerspace reservation overlaps another external event (${externalConflictRes.data.title || externalConflictRes.data.id}); access was not provisioned`)
  }
}

async function reportReconcileFailure(event: H3Event, params: {
  message: string
  bookingId?: string | null
  externalEventId: string
  externalReference?: string | null
}) {
  const serviceRole = serverSupabaseServiceRole(event)
  const { data: existingIncident, error: existingIncidentError } = await serviceRole
    .from('lock_access_incidents')
    .select('id')
    .eq('incident_type', 'peerspace_access_sync_failure')
    .eq('status', 'open')
    .contains('metadata', { externalCalendarEventId: params.externalEventId })
    .limit(1)
    .maybeSingle()

  if (!existingIncidentError && existingIncident?.id) return

  await createAccessIncident(event, {
    incidentType: 'peerspace_access_sync_failure',
    severity: 'error',
    title: 'Peerspace booking access sync failed',
    message: params.message,
    bookingId: params.bookingId ?? null,
    metadata: {
      externalCalendarEventId: params.externalEventId,
      externalReference: params.externalReference ?? null
    }
  }).catch(() => {})
}

async function resolveReconcileFailures(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  externalEventId: string
) {
  const nowIso = new Date().toISOString()
  const { error } = await db
    .from('lock_access_incidents')
    .update({
      status: 'resolved',
      resolved_at: nowIso,
      updated_at: nowIso
    })
    .eq('incident_type', 'peerspace_access_sync_failure')
    .eq('status', 'open')
    .contains('metadata', { externalCalendarEventId: externalEventId })

  if (error) {
    console.warn('[access/peerspace] failed to resolve recovered sync incidents', {
      externalEventId,
      error: error.message
    })
  }
}

export async function reconcilePeerspaceExternalBookings(event: H3Event, params: {
  windowStartIso: string
  windowEndIso: string
}) {
  const config = await getServerConfigMap(event, ['peerspace_access_auto_provision_enabled'])
  if (!asBoolean(config.peerspace_access_auto_provision_enabled, true)) {
    return {
      enabled: false,
      candidates: 0,
      created: 0,
      updated: 0,
      canceled: 0,
      failed: 0
    }
  }

  const serviceRole = serverSupabaseServiceRole(event)
  // This table is introduced by a forward migration and may not exist in generated local types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceRole as any
  const now = DateTime.now().setZone(STUDIO_TZ)

  const { data: eventRows, error: eventsError } = await db
    .from('external_calendar_events')
    .select('id,title,description,status,start_time,end_time,active,raw_payload')
    .lt('start_time', params.windowEndIso)
    .gt('end_time', params.windowStartIso)
    .order('start_time', { ascending: true })

  if (eventsError) throw new Error(eventsError.message)

  const candidates = ((eventRows ?? []) as ExternalCalendarEventRow[])
    .map(row => ({ row, details: parsePeerspaceEventDetails(row) }))
    .filter(item => item.details.isPeerspace)

  if (!candidates.length) {
    return {
      enabled: true,
      candidates: 0,
      created: 0,
      updated: 0,
      canceled: 0,
      failed: 0
    }
  }

  const eventIds = candidates.map(item => item.row.id)
  const references = candidates
    .map(item => item.details.externalReference)
    .filter((value): value is string => Boolean(value))

  const [linksByEventRes, linksByReferenceRes] = await Promise.all([
    db
      .from('booking_external_access')
      .select('id,booking_id,provider,external_calendar_event_id,external_reference,manage_url,delivery_status,metadata')
      .in('external_calendar_event_id', eventIds),
    references.length
      ? db
          .from('booking_external_access')
          .select('id,booking_id,provider,external_calendar_event_id,external_reference,manage_url,delivery_status,metadata')
          .in('provider', ['peerspace', 'manual'])
          .in('external_reference', references)
      : Promise.resolve({ data: [] as ExternalAccessRow[], error: null })
  ])

  if (linksByEventRes.error) throw new Error(linksByEventRes.error.message)
  if (linksByReferenceRes.error) throw new Error(linksByReferenceRes.error.message)

  const links = Array.from(new Map(
    [...(linksByEventRes.data ?? []), ...(linksByReferenceRes.data ?? [])]
      .map((row: ExternalAccessRow) => [row.id, row] as const)
  ).values())
  const bookingIds = links.map(row => row.booking_id)
  const { data: bookingRows, error: bookingsError } = bookingIds.length
    ? await db
        .from('bookings')
        .select('id,guest_name,start_time,end_time,status,notes')
        .in('id', bookingIds)
    : { data: [] as LinkedBookingRow[], error: null }

  if (bookingsError) throw new Error(bookingsError.message)

  const linkByEventId = new Map<string, ExternalAccessRow>()
  const bookingById = new Map<string, LinkedBookingRow>()
  for (const link of links) {
    if (link.external_calendar_event_id) linkByEventId.set(link.external_calendar_event_id, link)
  }
  for (const booking of (bookingRows ?? []) as LinkedBookingRow[]) bookingById.set(booking.id, booking)

  let created = 0
  let updated = 0
  let canceled = 0
  let failed = 0

  for (const { row, details } of candidates) {
    const directLink = linkByEventId.get(row.id) ?? null
    const referenceMatches = getPeerspaceReferenceMatches(links, details.externalReference)
    const adoptableReferenceLinks = referenceMatches.filter(candidate => (
      !candidate.external_calendar_event_id || candidate.external_calendar_event_id === row.id
    ))
    const linksClaimedByOtherEvents = referenceMatches.filter(candidate => (
      candidate.external_calendar_event_id && candidate.external_calendar_event_id !== row.id
    ))
    let link = directLink ?? (adoptableReferenceLinks.length === 1 ? adoptableReferenceLinks[0] : null)
    let booking = link ? bookingById.get(link.booking_id) ?? null : null

    try {
      if (!directLink && linksClaimedByOtherEvents.length) {
        throw new Error(`Peerspace confirmation ${details.externalReference} is already linked to another calendar event`)
      }
      if (!directLink && adoptableReferenceLinks.length > 1) {
        throw new Error(`Peerspace confirmation ${details.externalReference} matches multiple scheduled access records`)
      }

      const status = String(row.status ?? '').toLowerCase()
      const isActive = row.active && status !== 'cancelled' && status !== 'canceled'
      const { deactivateAt } = computeAccessWindow(row.start_time, row.end_time)
      const windowEnded = deactivateAt <= now

      if (!isActive) {
        if (!link || !booking) continue
        const bookingAlreadyCanceled = ['canceled', 'cancelled'].includes(String(booking.status).toLowerCase())
        const linkAlreadyClosed = link.delivery_status === 'not_required'
        if (!bookingAlreadyCanceled) {
          const { error: cancelError } = await db
            .from('bookings')
            .update({ status: 'canceled', updated_at: new Date().toISOString() })
            .eq('id', booking.id)
          if (cancelError) throw new Error(cancelError.message)

          canceled += 1
        }

        if (!linkAlreadyClosed) {
          const { error: linkCloseError } = await db
            .from('booking_external_access')
            .update({
              delivery_status: 'not_required',
              shared_at: null,
              shared_by: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', link.id)
          if (linkCloseError) throw new Error(linkCloseError.message)
        }

        if (!bookingAlreadyCanceled || !linkAlreadyClosed) {
          await enqueueBookingAccessSync(event, {
            bookingId: booking.id,
            reason: 'peerspace_event_canceled'
          })
        }
        continue
      }

      // Keep completed Peerspace reservations as confirmed history. The access
      // queue owns expiry; an ended event is not the same as a cancellation.
      if (windowEnded) {
        continue
      }

      if (!booking || bookingNeedsUpdate(booking, row, details.guestName)) {
        await assertNoExternalProvisioningConflict(db, row)
      }

      if (!link || !booking) {
        const nowIso = new Date().toISOString()
        const { data: insertedBooking, error: bookingError } = await db
          .from('bookings')
          .insert({
            user_id: null,
            customer_id: null,
            start_time: row.start_time,
            end_time: row.end_time,
            status: 'confirmed',
            guest_name: details.guestName,
            guest_email: null,
            notes: buildGeneratedNotes(details.externalReference),
            booking_kind: 'standard',
            booking_rate_kind: 'standard',
            created_at: nowIso,
            updated_at: nowIso
          })
          .select('id,guest_name,start_time,end_time,status,notes')
          .single()
        if (bookingError || !insertedBooking) {
          throw new Error(bookingError?.message ?? 'Failed to create Peerspace guest booking')
        }

        const { data: insertedLink, error: linkError } = await db
          .from('booking_external_access')
          .insert({
            booking_id: insertedBooking.id,
            provider: 'peerspace',
            external_calendar_event_id: row.id,
            external_reference: details.externalReference,
            manage_url: details.manageUrl,
            delivery_status: 'pending',
            metadata: {
              source: 'google_calendar_sync',
              eventTitle: row.title,
              rawEventId: normalizeText(asRecord(row.raw_payload).id)
            },
            created_at: nowIso,
            updated_at: nowIso
          })
          .select('id,booking_id,provider,external_calendar_event_id,external_reference,manage_url,delivery_status,metadata')
          .single()

        if (linkError || !insertedLink) {
          await db.from('bookings').delete().eq('id', insertedBooking.id)
          throw new Error(linkError?.message ?? 'Failed to link Peerspace booking')
        }

        link = insertedLink as ExternalAccessRow
        booking = insertedBooking as LinkedBookingRow
        links.push(link)
        linkByEventId.set(row.id, link)
        bookingById.set(booking.id, booking)

        await enqueueBookingAccessSync(event, {
          bookingId: booking.id,
          reason: 'peerspace_event_created'
        })
        await resolveReconcileFailures(db, row.id)
        created += 1
        continue
      }

      const needsBookingUpdate = bookingNeedsUpdate(booking, row, details.guestName)
      const wasCanceled = ['canceled', 'cancelled'].includes(String(booking.status).toLowerCase())
      const adoptedFromProvider = link.provider === 'manual' ? link.provider : null
      const needsLinkUpdate = link.provider !== 'peerspace'
        || link.external_calendar_event_id !== row.id
        || link.external_reference !== details.externalReference
        || link.manage_url !== details.manageUrl
        || (wasCanceled && link.delivery_status === 'not_required')

      if (needsBookingUpdate) {
        const { error: bookingUpdateError } = await db
          .from('bookings')
          .update({
            start_time: row.start_time,
            end_time: row.end_time,
            status: 'confirmed',
            ...(details.guestName ? { guest_name: details.guestName } : {}),
            updated_at: new Date().toISOString()
          })
          .eq('id', booking.id)
        if (bookingUpdateError) throw new Error(bookingUpdateError.message)
      }

      if (needsLinkUpdate) {
        const { error: linkUpdateError } = await db
          .from('booking_external_access')
          .update({
            provider: 'peerspace',
            external_calendar_event_id: row.id,
            external_reference: details.externalReference,
            manage_url: details.manageUrl,
            ...(wasCanceled
              ? {
                  delivery_status: 'pending',
                  shared_at: null,
                  shared_by: null
                }
              : {}),
            metadata: {
              ...asRecord(link.metadata),
              source: 'google_calendar_sync',
              eventTitle: row.title,
              rawEventId: normalizeText(asRecord(row.raw_payload).id),
              ...(adoptedFromProvider
                ? {
                    adoptedFromProvider,
                    adoptedAt: new Date().toISOString()
                  }
                : {})
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', link.id)
        if (linkUpdateError) throw new Error(linkUpdateError.message)
      }

      if (needsBookingUpdate) {
        await enqueueBookingAccessSync(event, {
          bookingId: booking.id,
          reason: 'peerspace_event_updated'
        })
      }

      await resolveReconcileFailures(db, row.id)
      if (needsBookingUpdate || needsLinkUpdate) updated += 1
    } catch (error) {
      failed += 1
      const message = (error as Error)?.message ?? String(error)
      await reportReconcileFailure(event, {
        message,
        bookingId: booking?.id,
        externalEventId: row.id,
        externalReference: details.externalReference
      })
    }
  }

  return {
    enabled: true,
    candidates: candidates.length,
    created,
    updated,
    canceled,
    failed
  }
}
