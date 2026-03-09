import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { isAdminRole, readUserRole } from '~~/server/utils/auth'
import type { RoleCarrier } from '~~/server/utils/auth'
import { computeOvernightHoldWindow } from '~~/server/utils/booking/holds'
import { loadPeakWindowConfig } from '~~/server/utils/booking/peak'

const bodySchema = z.object({
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  notes: z.string().max(500).optional().nullable()
})

const DEFAULT_MEMBER_RESCHEDULE_NOTICE_HOURS = 24

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const bookingId = getRouterParam(event, 'id')
  if (!bookingId) throw createError({ statusCode: 400, statusMessage: 'Missing booking id' })

  const body = bodySchema.parse(await readBody(event))
  const role = readUserRole(user as RoleCarrier)
  const isAdmin = isAdminRole(role)
  const supabase = serverSupabaseServiceRole(event)
  const peakWindow = await loadPeakWindowConfig(event)

  const nextStart = DateTime.fromISO(body.start_time)
  const nextEnd = DateTime.fromISO(body.end_time)
  if (!nextStart.isValid || !nextEnd.isValid) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })
  }
  if (nextEnd <= nextStart) {
    throw createError({ statusCode: 400, statusMessage: 'End time must be after start time' })
  }

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id,user_id,status,start_time')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })

  if (!isAdmin && booking.user_id !== user.sub) {
    throw createError({ statusCode: 403, statusMessage: 'Not your booking' })
  }

  const status = String(booking.status ?? '').toLowerCase()
  if (!['confirmed', 'requested', 'pending_payment'].includes(status)) {
    throw createError({ statusCode: 400, statusMessage: `Cannot reschedule booking in status "${booking.status}"` })
  }

  const { data: policyRow, error: policyErr } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'member_reschedule_notice_hours')
    .maybeSingle()

  if (policyErr) throw createError({ statusCode: 500, statusMessage: policyErr.message })

  const memberNoticeHours = Number(policyRow?.value ?? DEFAULT_MEMBER_RESCHEDULE_NOTICE_HOURS)
  const currentStart = DateTime.fromISO(booking.start_time)
  if (!currentStart.isValid) {
    throw createError({ statusCode: 409, statusMessage: 'This booking cannot be rescheduled right now. Invalid start time.' })
  }
  const hoursUntilCurrentStart = currentStart.diff(DateTime.now(), 'hours').hours

  if (hoursUntilCurrentStart <= 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This booking has already started or passed and can no longer be rescheduled.'
    })
  }

  if (!isAdmin && hoursUntilCurrentStart < memberNoticeHours) {
    throw createError({
      statusCode: 409,
      statusMessage: `Rescheduling is locked within ${memberNoticeHours} hours of the booking start time.`
    })
  }

  const startIso = nextStart.toUTC().toISO()
  const endIso = nextEnd.toUTC().toISO()
  if (!startIso || !endIso) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })
  }

  const { data: linkedHolds, error: linkedHoldsErr } = await supabase
    .from('booking_holds')
    .select('id')
    .eq('booking_id', bookingId)

  if (linkedHoldsErr) throw createError({ statusCode: 500, statusMessage: linkedHoldsErr.message })
  const hasLinkedHold = (linkedHolds?.length ?? 0) > 0

  const { data: bookingConflicts, error: bookingConflictErr } = await supabase
    .from('bookings')
    .select('id')
    .neq('id', bookingId)
    .in('status', ['confirmed', 'requested', 'pending_payment'])
    .lt('start_time', endIso)
    .gt('end_time', startIso)
    .limit(1)

  if (bookingConflictErr) throw createError({ statusCode: 500, statusMessage: bookingConflictErr.message })
  if (bookingConflicts && bookingConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Requested time conflicts with another booking' })
  }

  const { data: holdConflicts, error: holdErr } = await supabase
    .from('booking_holds')
    .select('id')
    .neq('booking_id', bookingId)
    .lt('hold_start', endIso)
    .gt('hold_end', startIso)
    .limit(1)

  if (holdErr) throw createError({ statusCode: 500, statusMessage: holdErr.message })
  if (holdConflicts && holdConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Requested time conflicts with an equipment hold' })
  }

  const { data: blockConflicts, error: blockErr } = await supabase
    .from('calendar_blocks')
    .select('id')
    .eq('active', true)
    .lt('start_time', endIso)
    .gt('end_time', startIso)
    .limit(1)

  if (blockErr) throw createError({ statusCode: 500, statusMessage: blockErr.message })
  if (blockConflicts && blockConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Requested time conflicts with a studio block' })
  }

  let nextHoldStartIso: string | null = null
  let nextHoldEndIso: string | null = null
  if (hasLinkedHold) {
    const holdWindow = computeOvernightHoldWindow(nextEnd, peakWindow.startHour)
    nextHoldStartIso = holdWindow.holdStartIso
    nextHoldEndIso = holdWindow.holdEndIso

    if (!nextHoldStartIso || !nextHoldEndIso) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid hold window' })
    }

    const { data: holdBookingConflicts, error: holdBookingErr } = await supabase
      .from('bookings')
      .select('id')
      .neq('id', bookingId)
      .in('status', ['confirmed', 'requested', 'pending_payment'])
      .lt('start_time', nextHoldEndIso)
      .gt('end_time', nextHoldStartIso)
      .limit(1)

    if (holdBookingErr) throw createError({ statusCode: 500, statusMessage: holdBookingErr.message })
    if (holdBookingConflicts && holdBookingConflicts.length > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Rescheduled hold conflicts with another booking' })
    }

    const { data: holdWindowConflicts, error: holdWindowErr } = await supabase
      .from('booking_holds')
      .select('id')
      .neq('booking_id', bookingId)
      .lt('hold_start', nextHoldEndIso)
      .gt('hold_end', nextHoldStartIso)
      .limit(1)

    if (holdWindowErr) throw createError({ statusCode: 500, statusMessage: holdWindowErr.message })
    if (holdWindowConflicts && holdWindowConflicts.length > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Rescheduled hold conflicts with an existing hold' })
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('bookings')
    .update({
      start_time: startIso,
      end_time: endIso,
      notes: body.notes ?? null,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .select('id,start_time,end_time,notes')
    .single()

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  if (hasLinkedHold && nextHoldStartIso && nextHoldEndIso) {
    const { error: holdUpdateErr } = await supabase
      .from('booking_holds')
      .update({
        hold_start: nextHoldStartIso,
        hold_end: nextHoldEndIso
      })
      .eq('booking_id', bookingId)

    if (holdUpdateErr) throw createError({ statusCode: 500, statusMessage: holdUpdateErr.message })
  }

  return { booking: updated, holdUpdated: hasLinkedHold }
})
