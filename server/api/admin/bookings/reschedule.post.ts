import { z } from 'zod'
import { DateTime } from 'luxon'
import { requireServerAdmin } from '~~/server/utils/auth'
import {
  computeOvernightHoldWindow,
  DEFAULT_HOLD_END_HOUR,
  DEFAULT_HOLD_MIN_END_HOUR,
  DEFAULT_MIN_HOLD_BOOKING_HOURS,
  validateOvernightHoldWindow
} from '~~/server/utils/booking/holds'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'

const STUDIO_TZ = 'America/Los_Angeles'

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  keepHold: z.boolean().optional().default(false),
  notes: z.string().max(500).optional().nullable()
})

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  if (new Date(body.endTime).getTime() <= new Date(body.startTime).getTime()) {
    throw createError({ statusCode: 400, statusMessage: 'End time must be after start time' })
  }

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id,user_id,status')
    .eq('id', body.bookingId)
    .maybeSingle()

  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  if (['canceled', 'completed', 'declined', 'no_show'].includes(String(booking.status ?? '').toLowerCase())) {
    throw createError({ statusCode: 400, statusMessage: `Cannot reschedule booking in status "${booking.status}"` })
  }

  const { data: conflicts, error: conflictErr } = await supabase
    .from('bookings')
    .select('id')
    .neq('id', body.bookingId)
    .in('status', ['confirmed', 'requested', 'pending_payment'])
    .lt('start_time', body.endTime)
    .gt('end_time', body.startTime)
    .limit(1)

  if (conflictErr) throw createError({ statusCode: 500, statusMessage: conflictErr.message })
  if (conflicts && conflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Requested time conflicts with another booking' })
  }

  const { data: linkedHolds, error: linkedHoldsErr } = await supabase
    .from('booking_holds')
    .select('id')
    .eq('booking_id', body.bookingId)
  if (linkedHoldsErr) throw createError({ statusCode: 500, statusMessage: linkedHoldsErr.message })
  const hasLinkedHold = (linkedHolds?.length ?? 0) > 0
  const keepHold = body.keepHold && hasLinkedHold

  const { data: blockConflicts, error: blockErr } = await supabase
    .from('calendar_blocks')
    .select('id')
    .eq('active', true)
    .lt('start_time', body.endTime)
    .gt('end_time', body.startTime)
    .limit(1)

  if (blockErr) throw createError({ statusCode: 500, statusMessage: blockErr.message })
  if (blockConflicts && blockConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Requested time conflicts with a studio block' })
  }

  let nextHoldStartIso: string | null = null
  let nextHoldEndIso: string | null = null
  if (keepHold) {
    const { data: holdConfigRows, error: holdConfigErr } = await supabase
      .from('system_config')
      .select('key,value')
      .in('key', ['min_hold_booking_hours', 'hold_min_end_hour', 'hold_end_hour'])
    if (holdConfigErr) throw createError({ statusCode: 500, statusMessage: holdConfigErr.message })
    const holdConfig = new Map((holdConfigRows ?? []).map(row => [String(row.key), row.value]))
    const minHoldBookingHours = Math.max(1, Number(holdConfig.get('min_hold_booking_hours') ?? DEFAULT_MIN_HOLD_BOOKING_HOURS))
    const holdMinEndHour = Math.max(0, Math.min(23, Math.floor(Number(holdConfig.get('hold_min_end_hour') ?? DEFAULT_HOLD_MIN_END_HOUR))))
    const holdEndHour = Math.max(0, Math.min(23, Math.floor(Number(holdConfig.get('hold_end_hour') ?? DEFAULT_HOLD_END_HOUR))))

    const nextStart = DateTime.fromISO(body.startTime, { setZone: true }).setZone(STUDIO_TZ)
    const nextEnd = DateTime.fromISO(body.endTime, { setZone: true }).setZone(STUDIO_TZ)
    const holdWindowValidation = validateOvernightHoldWindow(nextStart, nextEnd, minHoldBookingHours, holdMinEndHour)
    if (!holdWindowValidation.ok) {
      throw createError({ statusCode: 409, statusMessage: holdWindowValidation.message })
    }

    const holdWindow = computeOvernightHoldWindow(nextEnd, holdEndHour)
    nextHoldStartIso = holdWindow.holdStartIso
    nextHoldEndIso = holdWindow.holdEndIso
    if (!nextHoldStartIso || !nextHoldEndIso) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid hold window' })
    }

    const { data: holdBookingConflicts, error: holdBookingErr } = await supabase
      .from('bookings')
      .select('id')
      .neq('id', body.bookingId)
      .in('status', ['confirmed', 'requested', 'pending_payment'])
      .lt('start_time', nextHoldEndIso)
      .gt('end_time', nextHoldStartIso)
      .neq('user_id', booking.user_id)
      .limit(1)
    if (holdBookingErr) throw createError({ statusCode: 500, statusMessage: holdBookingErr.message })
    if (holdBookingConflicts && holdBookingConflicts.length > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Rescheduled hold conflicts with another member booking in the hold window' })
    }

    const { data: holdWindowConflicts, error: holdWindowErr } = await supabase
      .from('booking_holds')
      .select('id')
      .neq('booking_id', body.bookingId)
      .lt('hold_start', nextHoldEndIso)
      .gt('hold_end', nextHoldStartIso)
      .limit(1)
    if (holdWindowErr) throw createError({ statusCode: 500, statusMessage: holdWindowErr.message })
    if (holdWindowConflicts && holdWindowConflicts.length > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Rescheduled hold conflicts with an existing hold' })
    }
  } else {
    const { data: holdConflicts, error: holdErr } = await supabase
      .from('booking_holds')
      .select('id')
      .neq('booking_id', body.bookingId)
      .lt('hold_start', body.endTime)
      .gt('hold_end', body.startTime)
      .limit(1)

    if (holdErr) throw createError({ statusCode: 500, statusMessage: holdErr.message })
    if (holdConflicts && holdConflicts.length > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Requested time conflicts with an equipment hold' })
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('bookings')
    .update({
      start_time: body.startTime,
      end_time: body.endTime,
      notes: body.notes ?? null
    })
    .eq('id', body.bookingId)
    .select('id,start_time,end_time,notes')
    .single()

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  const { error: removeHoldErr } = await supabase
    .from('booking_holds')
    .delete()
    .eq('booking_id', body.bookingId)

  if (removeHoldErr) throw createError({ statusCode: 500, statusMessage: removeHoldErr.message })

  if (keepHold && nextHoldStartIso && nextHoldEndIso) {
    const { error: holdCreateErr } = await supabase
      .from('booking_holds')
      .insert({
        booking_id: body.bookingId,
        hold_start: nextHoldStartIso,
        hold_end: nextHoldEndIso,
        hold_type: 'overnight'
      })
    if (holdCreateErr) throw createError({ statusCode: 500, statusMessage: holdCreateErr.message })
  }

  let refundedHoldTokens = 0
  let refundedHoldCredits = 0
  if (hasLinkedHold && !keepHold && booking.user_id) {
    const { data: holdBurnRows, error: holdBurnErr } = await supabase
      .from('hold_ledger')
      .select('delta')
      .eq('user_id', booking.user_id)
      .eq('reason', 'booking_hold')
      .eq('external_ref', body.bookingId)
    if (holdBurnErr) throw createError({ statusCode: 500, statusMessage: holdBurnErr.message })

    const consumedHoldTokens = Math.abs((holdBurnRows ?? []).reduce((sum, row) => {
      const delta = asNumber(row?.delta)
      return delta < 0 ? sum + delta : sum
    }, 0))

    const { data: existingHoldRefundRows, error: holdRefundReadErr } = await supabase
      .from('hold_ledger')
      .select('delta')
      .eq('user_id', booking.user_id)
      .eq('reason', 'booking_hold_refund')
      .eq('external_ref', body.bookingId)
    if (holdRefundReadErr) throw createError({ statusCode: 500, statusMessage: holdRefundReadErr.message })

    const holdRefundedAlready = (existingHoldRefundRows ?? []).reduce((sum, row) => {
      const delta = asNumber(row?.delta)
      return delta > 0 ? sum + delta : sum
    }, 0)

    refundedHoldTokens = Math.max(0, consumedHoldTokens - holdRefundedAlready)
    if (refundedHoldTokens > 0) {
      const { error: holdRefundInsertErr } = await supabase
        .from('hold_ledger')
        .insert({
          user_id: booking.user_id,
          delta: refundedHoldTokens,
          reason: 'booking_hold_refund',
          external_ref: body.bookingId,
          metadata: {
            source: 'admin_reschedule_remove_hold'
          }
        })
      if (holdRefundInsertErr) throw createError({ statusCode: 500, statusMessage: holdRefundInsertErr.message })
    }

    const { data: creditBurnRows, error: creditBurnErr } = await supabase
      .from('credits_ledger')
      .select('delta')
      .eq('user_id', booking.user_id)
      .eq('reason', 'booking_hold')
      .eq('external_ref', body.bookingId)
    if (creditBurnErr) throw createError({ statusCode: 500, statusMessage: creditBurnErr.message })

    const consumedHoldCredits = Math.abs((creditBurnRows ?? []).reduce((sum, row) => {
      const delta = asNumber(row?.delta)
      return delta < 0 ? sum + delta : sum
    }, 0))

    const { data: existingCreditRefundRows, error: creditRefundReadErr } = await supabase
      .from('credits_ledger')
      .select('delta')
      .eq('user_id', booking.user_id)
      .eq('reason', 'booking_hold_refund')
      .eq('external_ref', body.bookingId)
    if (creditRefundReadErr) throw createError({ statusCode: 500, statusMessage: creditRefundReadErr.message })

    const creditRefundedAlready = (existingCreditRefundRows ?? []).reduce((sum, row) => {
      const delta = asNumber(row?.delta)
      return delta > 0 ? sum + delta : sum
    }, 0)

    refundedHoldCredits = Math.max(0, consumedHoldCredits - creditRefundedAlready)
    if (refundedHoldCredits > 0) {
      const { error: creditRefundInsertErr } = await supabase
        .from('credits_ledger')
        .insert({
          user_id: booking.user_id,
          membership_id: null,
          delta: refundedHoldCredits,
          reason: 'booking_hold_refund',
          external_ref: body.bookingId,
          metadata: {
            source: 'admin_reschedule_remove_hold'
          }
        })
      if (creditRefundInsertErr) throw createError({ statusCode: 500, statusMessage: creditRefundInsertErr.message })
    }
  }

  await enqueueBookingAccessSync(event, {
    bookingId: body.bookingId,
    reason: 'admin_booking_reschedule'
  }).catch((error) => {
    console.warn('[access/sync] failed to queue admin booking reschedule sync', {
      bookingId: body.bookingId,
      error: (error as Error)?.message ?? String(error)
    })
  })

  return {
    booking: updated,
    holdKept: keepHold,
    holdRemoved: hasLinkedHold && !keepHold,
    refundedHoldTokens,
    refundedHoldCredits
  }
})
