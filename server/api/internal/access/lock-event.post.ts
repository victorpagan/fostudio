import { z } from 'zod'
import { DateTime } from 'luxon'
import { getHeader } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { getKey } from '~~/server/utils/config/secret'
import { requireServerAdmin } from '~~/server/utils/auth'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'
import { createAccessIncident } from '~~/server/utils/access/incidents'
import { isAccessEligibleBookingStatus, isInsideAccessWindow, isOutsideAbodeArmingGap } from '~~/server/utils/access/policy'
import { sendAbodeAutomationEvent } from '~~/server/utils/access/providers'

const bodySchema = z.object({
  eventType: z.enum(['unlock', 'lock']),
  slotNumber: z.number().int().min(1).max(99),
  occurredAt: z.string().datetime().optional(),
  source: z.string().max(120).optional()
})

type AuthMode = 'shared_key' | 'admin'

function readBearerOrHeaderKey(event: Parameters<typeof getHeader>[0]) {
  const explicit = getHeader(event, 'x-access-key')
  if (explicit) return explicit.trim()

  const auth = getHeader(event, 'authorization')
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

async function requireInternalAccessAuth(event: Parameters<typeof getHeader>[0]): Promise<AuthMode> {
  const expected = await getKey(event, 'ACCESS_AUTOMATION_SHARED_KEY').catch(() => null)
  const provided = readBearerOrHeaderKey(event)

  if (typeof expected === 'string' && expected.trim() && provided === expected.trim()) {
    return 'shared_key'
  }

  await requireServerAdmin(event)
  return 'admin'
}

function resolveEventTime(occurredAt?: string) {
  if (!occurredAt) return DateTime.now().setZone(STUDIO_TZ)
  const dt = DateTime.fromISO(occurredAt, { setZone: true }).setZone(STUDIO_TZ)
  if (!dt.isValid) return DateTime.now().setZone(STUDIO_TZ)
  return dt
}

export default defineEventHandler(async (event) => {
  const authMode = await requireInternalAccessAuth(event)
  const body = bodySchema.parse(await readBody(event))
  const occurredAt = resolveEventTime(body.occurredAt)

  if (body.eventType !== 'unlock') {
    return {
      ok: true,
      authMode,
      ignored: true,
      reason: 'event_not_unlock'
    }
  }

  const supabase = serverSupabaseServiceRole(event) as any

  const { data: assignment, error: assignmentErr } = await supabase
    .from('lock_slot_assignments')
    .select('id,slot_kind,user_id,booking_id')
    .eq('slot_number', body.slotNumber)
    .eq('active', true)
    .maybeSingle()

  if (assignmentErr) throw createError({ statusCode: 500, statusMessage: assignmentErr.message })

  if (!assignment) {
    await createAccessIncident(event, {
      incidentType: 'unlock_without_slot_assignment',
      severity: 'warning',
      title: 'Unlock event without active slot assignment',
      message: `Received unlock for slot ${body.slotNumber}, but no active assignment exists.`,
      metadata: {
        slotNumber: body.slotNumber,
        source: body.source ?? null,
        occurredAt: occurredAt.toUTC().toISO()
      }
    }).catch(() => {})

    return {
      ok: true,
      authMode,
      ignored: true,
      reason: 'missing_slot_assignment'
    }
  }

  let activeBookingId: string | null = null

  if (assignment.slot_kind === 'member' && assignment.user_id) {
    const startsBefore = occurredAt.plus({ minutes: 30 }).toUTC().toISO()
    const endsAfter = occurredAt.minus({ minutes: 30 }).toUTC().toISO()

    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id,start_time,end_time,status')
      .eq('user_id', assignment.user_id)
      .in('status', ['confirmed', 'requested'])
      .lte('start_time', startsBefore)
      .gte('end_time', endsAfter)
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })

    if (!booking || !isAccessEligibleBookingStatus(booking.status) || !isInsideAccessWindow(booking.start_time, booking.end_time, occurredAt)) {
      await createAccessIncident(event, {
        incidentType: 'unlock_outside_member_window',
        severity: 'warning',
        title: 'Member unlock outside active booking window',
        message: `Slot ${body.slotNumber} unlocked without an active member booking window.`,
        userId: assignment.user_id,
        metadata: {
          slotNumber: body.slotNumber,
          occurredAt: occurredAt.toUTC().toISO(),
          source: body.source ?? null
        }
      }).catch(() => {})

      return {
        ok: true,
        authMode,
        ignored: true,
        reason: 'member_window_not_active'
      }
    }

    activeBookingId = booking.id
  }

  if (assignment.slot_kind === 'guest' && assignment.booking_id) {
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id,start_time,end_time,status')
      .eq('id', assignment.booking_id)
      .maybeSingle()

    if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })

    if (!booking || !isAccessEligibleBookingStatus(booking.status) || !isInsideAccessWindow(booking.start_time, booking.end_time, occurredAt)) {
      await createAccessIncident(event, {
        incidentType: 'unlock_outside_guest_window',
        severity: 'warning',
        title: 'Guest unlock outside active booking window',
        message: `Guest slot ${body.slotNumber} unlocked outside the expected booking window.`,
        bookingId: assignment.booking_id,
        metadata: {
          slotNumber: body.slotNumber,
          occurredAt: occurredAt.toUTC().toISO(),
          source: body.source ?? null
        }
      }).catch(() => {})

      return {
        ok: true,
        authMode,
        ignored: true,
        reason: 'guest_window_not_active'
      }
    }

    activeBookingId = booking.id
  }

  if (!isOutsideAbodeArmingGap(occurredAt)) {
    return {
      ok: true,
      authMode,
      ignored: true,
      reason: 'inside_daytime_gap',
      bookingId: activeBookingId
    }
  }

  try {
    const abode = await sendAbodeAutomationEvent(event, {
      eventType: 'unlock_disarm_home',
      bookingId: activeBookingId,
      userId: assignment.user_id ?? null,
      lockSlot: body.slotNumber,
      occurredAt: occurredAt.toUTC().toISO()
    })

    return {
      ok: true,
      authMode,
      bookingId: activeBookingId,
      abode
    }
  } catch (error) {
    const message = (error as Error)?.message ?? String(error)

    await createAccessIncident(event, {
      incidentType: 'abode_automation_failure',
      severity: 'error',
      title: 'Abode disarm automation failed on unlock',
      message,
      userId: assignment.user_id ?? null,
      bookingId: activeBookingId,
      metadata: {
        slotNumber: body.slotNumber,
        occurredAt: occurredAt.toUTC().toISO(),
        source: body.source ?? null
      }
    }).catch(() => {})

    return {
      ok: true,
      authMode,
      bookingId: activeBookingId,
      abode: {
        ok: false,
        error: message
      }
    }
  }
})
