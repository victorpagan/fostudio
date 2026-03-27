import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { isAdminRole, readUserRole } from '~~/server/utils/auth'
import type { RoleCarrier } from '~~/server/utils/auth'
import { ensureNoExternalCalendarConflict } from '~~/server/utils/booking/externalCalendar'
import { assertCurrentWaiver } from '~~/server/utils/waiver/status'
import {
  computeOvernightHoldWindow,
  DEFAULT_HOLD_END_HOUR,
  DEFAULT_HOLD_MIN_END_HOUR,
  DEFAULT_MIN_HOLD_BOOKING_HOURS,
  validateOvernightHoldWindow
} from '~~/server/utils/booking/holds'
import { isPeakByConfig, loadPeakWindowConfig, STUDIO_TZ } from '~~/server/utils/booking/peak'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'

const bodySchema = z.object({
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  notes: z.string().max(500).optional().nullable(),
  request_hold: z.boolean().optional().default(false),
  hold_payment_method: z.enum(['auto', 'token', 'credits']).optional().default('auto')
})

const DEFAULT_MEMBER_RESCHEDULE_NOTICE_HOURS = 24
const DEFAULT_HOLD_CREDIT_COST = 2
function computeCredits(startIso: string, endIso: string, peakMultiplier: number, peakWindow: Awaited<ReturnType<typeof loadPeakWindowConfig>>) {
  const start = DateTime.fromISO(startIso, { zone: STUDIO_TZ })
  const end = DateTime.fromISO(endIso, { zone: STUDIO_TZ })
  if (!start.isValid || !end.isValid) throw new Error('Invalid datetime')
  if (!(start < end)) throw new Error('Invalid time range')

  const stepMinutes = 15
  let cursor = start
  let credits = 0

  while (cursor < end) {
    const next = cursor.plus({ minutes: stepMinutes })
    const bucketEnd = next < end ? next : end
    const minutes = bucketEnd.diff(cursor, 'minutes').minutes

    const rate = isPeakByConfig(cursor, peakWindow) ? peakMultiplier : 1.0
    credits += (minutes / 60) * rate
    cursor = bucketEnd
  }

  return Math.round(credits * 100) / 100
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const bookingId = getRouterParam(event, 'id')
  if (!bookingId) throw createError({ statusCode: 400, statusMessage: 'Missing booking id' })

  const body = bodySchema.parse(await readBody(event))
  const role = readUserRole(user as RoleCarrier)
  const isAdmin = isAdminRole(role)
  const supabase = serverSupabaseServiceRole(event)
  const db = supabase as any
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
    .select('id,user_id,status,start_time,end_time,credits_burned')
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingErr) throw createError({ statusCode: 500, statusMessage: bookingErr.message })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  const bookingUserId = booking.user_id
  if (!bookingUserId) throw createError({ statusCode: 400, statusMessage: 'Booking has no owner' })

  if (!isAdmin && bookingUserId !== user.sub) {
    throw createError({ statusCode: 403, statusMessage: 'Not your booking' })
  }
  if (!isAdmin) {
    await assertCurrentWaiver(event, bookingUserId)
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

  await ensureNoExternalCalendarConflict(supabase, startIso, endIso)

  const { data: linkedHolds, error: linkedHoldsErr } = await supabase
    .from('booking_holds')
    .select('id')
    .eq('booking_id', bookingId)

  if (linkedHoldsErr) throw createError({ statusCode: 500, statusMessage: linkedHoldsErr.message })
  const hasLinkedHold = (linkedHolds?.length ?? 0) > 0
  const requestNewHold = Boolean(body.request_hold)
  const shouldHaveHoldAfterReschedule = requestNewHold

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('tier,status,current_period_start,current_period_end')
    .eq('user_id', bookingUserId)
    .maybeSingle()
  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })

  const hasActiveMembership = String(membership?.status ?? '').toLowerCase() === 'active'

  let peakMultiplier = 1.5
  let holdsIncluded = 0
  let activeHoldCap = 0
  if (hasActiveMembership && membership?.tier) {
    const { data: tierWithCap, error: tierWithCapErr } = await db
      .from('membership_tiers')
      .select('peak_multiplier,holds_included,active_hold_cap')
      .eq('id', membership.tier)
      .maybeSingle()

    if (tierWithCapErr && /column .* does not exist/i.test(tierWithCapErr.message)) {
      const { data: tierLegacy, error: tierLegacyErr } = await db
        .from('membership_tiers')
        .select('peak_multiplier,holds_included')
        .eq('id', membership.tier)
        .maybeSingle()
      if (tierLegacyErr) throw createError({ statusCode: 500, statusMessage: tierLegacyErr.message })
      peakMultiplier = Number(tierLegacy?.peak_multiplier ?? peakMultiplier)
      holdsIncluded = Math.max(0, Number(tierLegacy?.holds_included ?? 0))
      activeHoldCap = 0
    } else if (tierWithCapErr) {
      throw createError({ statusCode: 500, statusMessage: tierWithCapErr.message })
    } else {
      peakMultiplier = Number(tierWithCap?.peak_multiplier ?? peakMultiplier)
      holdsIncluded = Math.max(0, Number(tierWithCap?.holds_included ?? 0))
      activeHoldCap = Math.max(0, Number((tierWithCap as Record<string, unknown> | null)?.active_hold_cap ?? 0))
    }
  }

  const oldCreditsBurned = computeCredits(booking.start_time, booking.end_time, peakMultiplier, peakWindow)
  const recalculatedCreditsBurned = computeCredits(startIso, endIso, peakMultiplier, peakWindow)
  const roundedCreditDelta = Math.round((recalculatedCreditsBurned - oldCreditsBurned) * 100) / 100
  const additionalBookingCreditsNeeded = roundedCreditDelta > 0 ? roundedCreditDelta : 0
  const bookingCreditRefund = roundedCreditDelta < 0 ? Math.abs(roundedCreditDelta) : 0

  let consumePaidHold = false
  let holdCreditCharge = 0
  let minHoldBookingHours = DEFAULT_MIN_HOLD_BOOKING_HOURS
  let holdMinEndHour = DEFAULT_HOLD_MIN_END_HOUR
  let holdEndHour = DEFAULT_HOLD_END_HOUR
  if (shouldHaveHoldAfterReschedule) {
    const { data: holdConfigRows, error: holdConfigErr } = await supabase
      .from('system_config')
      .select('key,value')
      .in('key', ['min_hold_booking_hours', 'hold_min_end_hour', 'hold_end_hour'])
    if (holdConfigErr) throw createError({ statusCode: 500, statusMessage: holdConfigErr.message })
    const holdConfig = new Map((holdConfigRows ?? []).map(row => [String(row.key), row.value]))
    minHoldBookingHours = Math.max(1, Number(holdConfig.get('min_hold_booking_hours') ?? DEFAULT_MIN_HOLD_BOOKING_HOURS))
    holdMinEndHour = Math.max(0, Math.min(23, Math.floor(Number(holdConfig.get('hold_min_end_hour') ?? DEFAULT_HOLD_MIN_END_HOUR))))
    holdEndHour = Math.max(0, Math.min(23, Math.floor(Number(holdConfig.get('hold_end_hour') ?? DEFAULT_HOLD_END_HOUR))))
    const holdWindowValidation = validateOvernightHoldWindow(nextStart, nextEnd, minHoldBookingHours, holdMinEndHour)
    if (!holdWindowValidation.ok) {
      throw createError({ statusCode: 409, statusMessage: holdWindowValidation.message })
    }
  }

  if (requestNewHold) {
    const { data: configRows, error: configErr } = await supabase
      .from('system_config')
      .select('key,value')
      .in('key', ['hold_credit_cost'])
    if (configErr) throw createError({ statusCode: 500, statusMessage: configErr.message })
    const configMap = new Map((configRows ?? []).map(row => [String(row.key), row.value]))
    const holdCreditCost = Math.max(0, Number(configMap.get('hold_credit_cost') ?? DEFAULT_HOLD_CREDIT_COST))

    if (!membership || !hasActiveMembership) {
      throw createError({ statusCode: 403, statusMessage: 'Overnight holds require an active membership' })
    }
    if (activeHoldCap <= 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Your current membership does not allow active equipment holds.'
      })
    }

    const nowIso = new Date().toISOString()
    const { count: activeHoldCount, error: activeHoldCountErr } = await supabase
      .from('booking_holds')
      .select('id, bookings!inner(user_id,status)', { count: 'exact', head: true })
      .eq('bookings.user_id', bookingUserId)
      .in('bookings.status', ['confirmed', 'requested', 'pending_payment'])
      .neq('booking_id', bookingId)
      .gt('hold_end', nowIso)
    if (activeHoldCountErr) throw createError({ statusCode: 500, statusMessage: activeHoldCountErr.message })
    if (Math.max(0, activeHoldCount ?? 0) >= activeHoldCap) {
      throw createError({
        statusCode: 409,
        statusMessage: `Active hold cap reached (${activeHoldCap}). Wait for an existing hold to finish before adding another.`
      })
    }

    const periodStartIso = typeof membership.current_period_start === 'string' ? DateTime.fromISO(membership.current_period_start).toUTC().toISO() : null
    const periodEndIso = typeof membership.current_period_end === 'string' ? DateTime.fromISO(membership.current_period_end).toUTC().toISO() : null
    if (!periodStartIso || !periodEndIso) {
      throw createError({ statusCode: 500, statusMessage: 'Could not resolve hold cycle window' })
    }

    const { count: usedHoldsCount, error: usedHoldsErr } = await supabase
      .from('booking_holds')
      .select('id, bookings!inner(user_id,status)', { count: 'exact', head: true })
      .eq('bookings.user_id', bookingUserId)
      .not('bookings.status', 'eq', 'canceled')
      .neq('booking_id', bookingId)
      .gte('hold_start', periodStartIso)
      .lt('hold_start', periodEndIso)
    if (usedHoldsErr) throw createError({ statusCode: 500, statusMessage: usedHoldsErr.message })

    const usedHoldsThisCycle = Math.max(0, usedHoldsCount ?? 0)
    const includedHoldsRemaining = Math.max(0, holdsIncluded - usedHoldsThisCycle)
    if (includedHoldsRemaining <= 0) {
      const { data: holdBalanceRow, error: holdBalanceErr } = await supabase
        .from('hold_balance')
        .select('balance')
        .eq('user_id', bookingUserId)
        .maybeSingle()
      if (holdBalanceErr) throw createError({ statusCode: 500, statusMessage: holdBalanceErr.message })

      const paidHoldBalance = Math.max(0, Math.floor(Number(holdBalanceRow?.balance ?? 0)))
      if (body.hold_payment_method === 'token') {
        if (paidHoldBalance < 1) {
          throw createError({
            statusCode: 402,
            statusMessage: 'No hold credits available. Buy additional holds to request an overnight hold.'
          })
        }
        consumePaidHold = true
      } else if (body.hold_payment_method === 'credits') {
        if (holdCreditCost <= 0) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Credit fallback for holds is currently unavailable.'
          })
        }
        holdCreditCharge = holdCreditCost
      } else if (paidHoldBalance >= 1) {
        consumePaidHold = true
      } else if (holdCreditCost > 0) {
        holdCreditCharge = holdCreditCost
      } else {
        throw createError({
          statusCode: 402,
          statusMessage: 'No hold credits available. Buy additional holds to request an overnight hold.'
        })
      }
    }

    if (holdCreditCharge > 0) {
      // validated below in a combined insufficient-credit check
    }
  }

  const totalAdditionalCreditsNeeded = Math.round((additionalBookingCreditsNeeded + holdCreditCharge) * 100) / 100
  if (totalAdditionalCreditsNeeded > 0) {
    const { data: balanceRow, error: balanceErr } = await supabase
      .from('credit_balance')
      .select('balance')
      .eq('user_id', bookingUserId)
      .maybeSingle()
    if (balanceErr) throw createError({ statusCode: 500, statusMessage: balanceErr.message })
    const availableCredits = Math.max(0, Number(balanceRow?.balance ?? 0))
    if (availableCredits < totalAdditionalCreditsNeeded) {
      const missing = Math.round((totalAdditionalCreditsNeeded - availableCredits) * 100) / 100
      throw createError({
        statusCode: 402,
        statusMessage: `Insufficient credits for this reschedule. You need ${totalAdditionalCreditsNeeded} additional credits (${additionalBookingCreditsNeeded} for time change${holdCreditCharge > 0 ? ` + ${holdCreditCharge} for hold` : ''}), have ${availableCredits}, and are short ${missing}. Please buy a top-off and try again.`
      })
    }
  }

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
    .select('id,bookings!inner(user_id)')
    .neq('booking_id', bookingId)
    .lt('hold_start', endIso)
    .gt('hold_end', startIso)
    .neq('bookings.user_id', bookingUserId)
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
  if (shouldHaveHoldAfterReschedule) {
    const holdWindow = computeOvernightHoldWindow(nextEnd, holdEndHour)
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
      .neq('user_id', bookingUserId)
      .limit(1)

    if (holdBookingErr) throw createError({ statusCode: 500, statusMessage: holdBookingErr.message })
    if (holdBookingConflicts && holdBookingConflicts.length > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Rescheduled hold conflicts with another member booking in the hold window' })
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
      credits_burned: recalculatedCreditsBurned,
      notes: body.notes ?? null,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .select('id,start_time,end_time,notes,credits_burned')
    .single()

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  if (hasLinkedHold) {
    const { error: holdDeleteErr } = await supabase
      .from('booking_holds')
      .delete()
      .eq('booking_id', bookingId)
    if (holdDeleteErr) throw createError({ statusCode: 500, statusMessage: holdDeleteErr.message })
  }

  if (requestNewHold && nextHoldStartIso && nextHoldEndIso) {
    const { error: holdCreateErr } = await supabase
      .from('booking_holds')
      .insert({
        booking_id: bookingId,
        hold_start: nextHoldStartIso,
        hold_end: nextHoldEndIso,
        hold_type: 'overnight'
      })
    if (holdCreateErr) throw createError({ statusCode: 500, statusMessage: holdCreateErr.message })

    if (consumePaidHold) {
      const { data: existingHoldLedger, error: existingHoldLedgerErr } = await supabase
        .from('hold_ledger')
        .select('id')
        .eq('user_id', bookingUserId)
        .eq('reason', 'booking_hold')
        .eq('external_ref', bookingId)
        .maybeSingle()
      if (existingHoldLedgerErr) throw createError({ statusCode: 500, statusMessage: existingHoldLedgerErr.message })
      if (!existingHoldLedger) {
        const { error: holdLedgerErr } = await supabase
          .from('hold_ledger')
          .insert({
            user_id: bookingUserId,
            delta: -1,
            reason: 'booking_hold',
            external_ref: bookingId,
            metadata: { source: 'booking_reschedule_hold' }
          })
        if (holdLedgerErr) throw createError({ statusCode: 500, statusMessage: holdLedgerErr.message })
      }
    }

    if (holdCreditCharge > 0) {
      const { data: existingCreditLedger, error: existingCreditLedgerErr } = await supabase
        .from('credits_ledger')
        .select('id')
        .eq('user_id', bookingUserId)
        .eq('reason', 'booking_hold')
        .eq('external_ref', bookingId)
        .maybeSingle()
      if (existingCreditLedgerErr) throw createError({ statusCode: 500, statusMessage: existingCreditLedgerErr.message })
      if (!existingCreditLedger) {
        const { error: creditLedgerErr } = await supabase
          .from('credits_ledger')
          .insert({
            user_id: bookingUserId,
            membership_id: null,
            delta: -holdCreditCharge,
            reason: 'booking_hold',
            external_ref: bookingId,
            metadata: { source: 'booking_reschedule_hold', hold_credit_cost: holdCreditCharge }
          })
        if (creditLedgerErr) throw createError({ statusCode: 500, statusMessage: creditLedgerErr.message })
      }
    }
  }

  if (additionalBookingCreditsNeeded > 0) {
    const { error: extraBurnErr } = await supabase
      .from('credits_ledger')
      .insert({
        user_id: bookingUserId,
        membership_id: null,
        delta: -additionalBookingCreditsNeeded,
        reason: 'booking_reschedule_charge',
        external_ref: bookingId,
        metadata: {
          source: 'booking_reschedule',
          old_credits_burned: oldCreditsBurned,
          new_credits_burned: recalculatedCreditsBurned
        }
      })
    if (extraBurnErr) throw createError({ statusCode: 500, statusMessage: extraBurnErr.message })
  } else if (bookingCreditRefund > 0) {
    const { error: refundErr } = await supabase
      .from('credits_ledger')
      .insert({
        user_id: bookingUserId,
        membership_id: null,
        delta: bookingCreditRefund,
        reason: 'booking_reschedule_refund',
        external_ref: bookingId,
        metadata: {
          source: 'booking_reschedule',
          old_credits_burned: oldCreditsBurned,
          new_credits_burned: recalculatedCreditsBurned
        }
      })
    if (refundErr) throw createError({ statusCode: 500, statusMessage: refundErr.message })
  }

  await enqueueBookingAccessSync(event, {
    bookingId,
    reason: 'member_booking_reschedule'
  }).catch((error) => {
    console.warn('[access/sync] failed to queue booking reschedule sync', {
      bookingId,
      error: (error as Error)?.message ?? String(error)
    })
  })

  return {
    booking: updated,
    holdUpdated: hasLinkedHold && requestNewHold,
    holdReleased: hasLinkedHold,
    holdCreated: requestNewHold,
    creditDelta: roundedCreditDelta,
    oldCreditsBurned,
    newCreditsBurned: recalculatedCreditsBurned
  }
})
