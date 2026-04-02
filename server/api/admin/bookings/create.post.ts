import { z } from 'zod'
import { DateTime } from 'luxon'
import { requireServerAdmin } from '~~/server/utils/auth'
import { ensureNoExternalCalendarConflict } from '~~/server/utils/booking/externalCalendar'
import {
  computeOvernightHoldWindow,
  DEFAULT_HOLD_END_HOUR,
  DEFAULT_HOLD_MIN_END_HOUR,
  DEFAULT_MIN_HOLD_BOOKING_HOURS,
  resolveHoldCycleWindow,
  validateOvernightHoldWindow
} from '~~/server/utils/booking/holds'
import { isPeakByConfig, loadPeakWindowConfig, STUDIO_TZ } from '~~/server/utils/booking/peak'
import { resolveAvailableCreditBalance } from '~~/server/utils/credits/availableBalance'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'
import { maybeForceSyncGoogleCalendar } from '~~/server/utils/integrations/googleCalendar'

const schema = z.object({
  userId: z.string().uuid(),
  startTime: z.string(),
  endTime: z.string(),
  notes: z.string().optional().nullable(),
  requestHold: z.boolean().optional().default(false),
  burnCredits: z.boolean().optional().default(true)
})

type TierRules = {
  booking_window_days: number
  peak_multiplier: number
  holds_included: number
  active_hold_cap: number
}

function isThirtyMinuteAligned(dateTime: DateTime) {
  if (!dateTime.isValid) return false
  if (dateTime.second !== 0 || dateTime.millisecond !== 0) return false
  return dateTime.minute % 30 === 0
}

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
  const { supabase } = await requireServerAdmin(event)
  const body = schema.parse(await readBody(event))
  const peakWindow = await loadPeakWindowConfig(event)

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('status,tier,current_period_start,current_period_end')
    .eq('user_id', body.userId)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })

  let remainingCredits = 0
  try {
    remainingCredits = await resolveAvailableCreditBalance(supabase, body.userId)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load member credits'
    throw createError({ statusCode: 500, statusMessage: message })
  }

  const hasActiveMembership = (membership?.status ?? '').toLowerCase() === 'active'

  const { data: tierRow, error: tierErr } = await supabase
    .from('membership_tiers')
    .select('booking_window_days, peak_multiplier, holds_included')
    .eq('id', membership?.tier ?? '')
    .maybeSingle()
  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })

  let tierActiveHoldCap: number | null = null
  if (membership?.tier) {
    const tierCapResult = await (
      supabase
        .from('membership_tiers')
        .select('active_hold_cap')
        .eq('id', membership.tier)
        .maybeSingle() as unknown as Promise<{
        data: { active_hold_cap: number | null } | null
        error: { message: string } | null
      }>
    )
    if (!tierCapResult.error) {
      tierActiveHoldCap = Number(tierCapResult.data?.active_hold_cap ?? 0)
    }
  }

  const effectiveTier: TierRules | null = tierRow
    ? {
        booking_window_days: Number(tierRow.booking_window_days ?? 30),
        peak_multiplier: Number(tierRow.peak_multiplier ?? 1.5),
        holds_included: Number(tierRow.holds_included ?? 0),
        active_hold_cap: Number(tierActiveHoldCap ?? tierRow.holds_included ?? 0)
      }
    : membership?.tier === 'test'
      ? {
          booking_window_days: 30,
          peak_multiplier: 1,
          holds_included: 1,
          active_hold_cap: 1
        }
      : remainingCredits > 0 || !body.burnCredits
        ? {
            booking_window_days: 30,
            peak_multiplier: 1.5,
            holds_included: 0,
            active_hold_cap: 0
          }
        : null

  if (!effectiveTier) {
    throw createError({ statusCode: 400, statusMessage: 'Tier configuration missing for selected member' })
  }

  const start = DateTime.fromISO(body.startTime, { zone: STUDIO_TZ })
  const end = DateTime.fromISO(body.endTime, { zone: STUDIO_TZ })
  if (!start.isValid || !end.isValid) throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })
  if (!(start < end)) throw createError({ statusCode: 400, statusMessage: 'Invalid time range' })
  if (!isThirtyMinuteAligned(start) || !isThirtyMinuteAligned(end)) {
    throw createError({ statusCode: 400, statusMessage: 'Member bookings must start and end on 30-minute increments.' })
  }
  if (end.diff(start, 'minutes').minutes < 30) {
    throw createError({ statusCode: 400, statusMessage: 'Minimum booking is 30 minutes.' })
  }

  const now = DateTime.now().setZone(STUDIO_TZ)
  if (start < now) throw createError({ statusCode: 400, statusMessage: 'Cannot book in the past' })
  const maxStart = now.plus({ days: effectiveTier.booking_window_days })
  if (start > maxStart) {
    throw createError({
      statusCode: 403,
      statusMessage: `Member booking window is ${effectiveTier.booking_window_days} days.`
    })
  }

  const creditsNeeded = computeCredits(body.startTime, body.endTime, effectiveTier.peak_multiplier, peakWindow)

  const { data: holdConfigRows, error: holdConfigErr } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', ['hold_credit_cost', 'min_hold_booking_hours', 'hold_min_end_hour', 'hold_end_hour'])

  if (holdConfigErr) throw createError({ statusCode: 500, statusMessage: holdConfigErr.message })
  const holdConfig = new Map((holdConfigRows ?? []).map(row => [String(row.key), row.value]))
  const holdCreditCost = Math.max(0, Number(holdConfig.get('hold_credit_cost') ?? 2))
  const minHoldBookingHours = Math.max(1, Number(holdConfig.get('min_hold_booking_hours') ?? DEFAULT_MIN_HOLD_BOOKING_HOURS))
  const holdMinEndHour = Math.max(0, Math.min(23, Math.floor(Number(holdConfig.get('hold_min_end_hour') ?? DEFAULT_HOLD_MIN_END_HOUR))))
  const holdEndHour = Math.max(0, Math.min(23, Math.floor(Number(holdConfig.get('hold_end_hour') ?? DEFAULT_HOLD_END_HOUR))))

  const startIso = start.toUTC().toISO()
  const endIso = end.toUTC().toISO()
  if (!startIso || !endIso) throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })

  const { data: blockConflicts, error: blockErr } = await supabase
    .from('calendar_blocks')
    .select('id')
    .eq('active', true)
    .lt('start_time', endIso)
    .gt('end_time', startIso)
    .limit(1)
  if (blockErr) throw createError({ statusCode: 500, statusMessage: blockErr.message })
  if (blockConflicts && blockConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Time slot is blocked by studio admin' })
  }

  await ensureNoExternalCalendarConflict(supabase, startIso, endIso)

  const { data: bookingConflicts, error: bookingConflictErr } = await supabase
    .from('bookings')
    .select('id')
    .in('status', ['confirmed', 'requested', 'pending_payment'])
    .lt('start_time', endIso)
    .gt('end_time', startIso)
    .limit(1)
  if (bookingConflictErr) throw createError({ statusCode: 500, statusMessage: bookingConflictErr.message })
  if (bookingConflicts && bookingConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Time slot is already booked' })
  }

  const { data: holdConflicts, error: holdErr } = await supabase
    .from('booking_holds')
    .select('id,bookings!inner(user_id)')
    .lt('hold_start', endIso)
    .gt('hold_end', startIso)
    .neq('bookings.user_id', body.userId)
    .limit(1)
  if (holdErr) throw createError({ statusCode: 500, statusMessage: holdErr.message })
  if (holdConflicts && holdConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Time slot is blocked by an equipment hold' })
  }

  let consumePaidHold = false
  let holdCreditCharge = 0
  let holdStartIso: string | null = null
  let holdEndIso: string | null = null

  if (body.requestHold) {
    const holdWindowValidation = validateOvernightHoldWindow(start, end, minHoldBookingHours, holdMinEndHour)
    if (!holdWindowValidation.ok) {
      throw createError({ statusCode: 409, statusMessage: holdWindowValidation.message })
    }

    if (!hasActiveMembership || !membership) {
      throw createError({ statusCode: 403, statusMessage: 'Overnight holds require an active membership' })
    }

    const activeHoldCap = Math.max(0, Number(effectiveTier.active_hold_cap ?? 0))
    if (activeHoldCap <= 0) {
      throw createError({ statusCode: 409, statusMessage: 'Current membership does not allow active equipment holds.' })
    }

    const nowIso = new Date().toISOString()
    const { count: activeHoldCount, error: activeHoldCountErr } = await supabase
      .from('booking_holds')
      .select('id, bookings!inner(user_id,status)', { count: 'exact', head: true })
      .eq('bookings.user_id', body.userId)
      .in('bookings.status', ['confirmed', 'requested', 'pending_payment'])
      .gt('hold_end', nowIso)
    if (activeHoldCountErr) throw createError({ statusCode: 500, statusMessage: activeHoldCountErr.message })
    if (Math.max(0, activeHoldCount ?? 0) >= activeHoldCap) {
      throw createError({
        statusCode: 409,
        statusMessage: `Active hold cap reached (${activeHoldCap}). Wait for an existing hold to finish before adding another.`
      })
    }

    const holdCycle = resolveHoldCycleWindow({
      periodStartIso: membership.current_period_start ?? null,
      periodEndIso: membership.current_period_end ?? null
    })
    if (!holdCycle.startIso || !holdCycle.endIso) {
      throw createError({ statusCode: 500, statusMessage: 'Could not resolve hold cycle window' })
    }

    const { count: usedHoldsCount, error: usedHoldsErr } = await supabase
      .from('booking_holds')
      .select('id, bookings!inner(user_id,status)', { count: 'exact', head: true })
      .eq('bookings.user_id', body.userId)
      .not('bookings.status', 'eq', 'canceled')
      .gte('hold_start', holdCycle.startIso)
      .lt('hold_start', holdCycle.endIso)
    if (usedHoldsErr) throw createError({ statusCode: 500, statusMessage: usedHoldsErr.message })

    const usedHoldsThisCycle = Math.max(0, usedHoldsCount ?? 0)
    const includedHoldsRemaining = Math.max(0, Number(effectiveTier.holds_included ?? 0) - usedHoldsThisCycle)
    if (includedHoldsRemaining <= 0) {
      const { data: holdBalanceRow, error: holdBalanceErr } = await supabase
        .from('hold_balance')
        .select('balance')
        .eq('user_id', body.userId)
        .maybeSingle()
      if (holdBalanceErr) throw createError({ statusCode: 500, statusMessage: holdBalanceErr.message })

      const paidHoldBalance = Math.max(0, Math.floor(Number(holdBalanceRow?.balance ?? 0)))
      if (paidHoldBalance >= 1) {
        consumePaidHold = true
      } else if (body.burnCredits && holdCreditCost > 0) {
        holdCreditCharge = holdCreditCost
      } else {
        throw createError({
          statusCode: 402,
          statusMessage: body.burnCredits
            ? 'No hold credits available. Buy additional holds to request an overnight hold.'
            : 'No included holds remaining and no paid hold credits available for this member.'
        })
      }
    }

    const holdWindow = computeOvernightHoldWindow(end, holdEndHour)
    holdStartIso = holdWindow.holdStartIso
    holdEndIso = holdWindow.holdEndIso
    if (!holdStartIso || !holdEndIso) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid hold window' })
    }

    const { data: holdWindowBookingConflicts, error: holdWindowBookingErr } = await supabase
      .from('bookings')
      .select('id')
      .in('status', ['confirmed', 'requested', 'pending_payment'])
      .lt('start_time', holdEndIso)
      .gt('end_time', holdStartIso)
      .neq('user_id', body.userId)
      .limit(1)
    if (holdWindowBookingErr) throw createError({ statusCode: 500, statusMessage: holdWindowBookingErr.message })
    if (holdWindowBookingConflicts && holdWindowBookingConflicts.length > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Requested hold conflicts with another member booking in the hold window' })
    }

    const { data: holdWindowHoldConflicts, error: holdWindowHoldErr } = await supabase
      .from('booking_holds')
      .select('id')
      .lt('hold_start', holdEndIso)
      .gt('hold_end', holdStartIso)
      .limit(1)
    if (holdWindowHoldErr) throw createError({ statusCode: 500, statusMessage: holdWindowHoldErr.message })
    if (holdWindowHoldConflicts && holdWindowHoldConflicts.length > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Requested hold conflicts with an existing hold' })
    }
  }

  if (body.burnCredits && remainingCredits <= 0) {
    throw createError({ statusCode: 402, statusMessage: 'Member has no available credits to burn.' })
  }

  if (body.burnCredits) {
    if (!membership) {
      throw createError({ statusCode: 400, statusMessage: 'Selected member does not have a membership record.' })
    }

    const requiredCredits = creditsNeeded + holdCreditCharge
    if (remainingCredits < requiredCredits) {
      throw createError({
        statusCode: 402,
        statusMessage: `Insufficient credits. Member has ${remainingCredits} credits and needs ${requiredCredits}.`
      })
    }

    const { data: customer, error: customerErr } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', body.userId)
      .maybeSingle()
    if (customerErr) throw createError({ statusCode: 500, statusMessage: customerErr.message })
    if (!customer?.id) throw createError({ statusCode: 400, statusMessage: 'Customer profile missing for selected member' })

    const rpcBody = {
      p_user_id: body.userId,
      p_customer_id: customer.id,
      p_start_time: startIso,
      p_end_time: endIso,
      p_notes: (body.notes ?? '') as string,
      p_request_hold: body.requestHold,
      p_credits_needed: creditsNeeded,
      p_consume_paid_hold: consumePaidHold,
      p_hold_credit_cost: holdCreditCharge
    }

    const { data: rawResult, error: rpcErr } = await supabase.rpc('create_confirmed_booking_with_burn', rpcBody)
    if (rpcErr) {
      const msg = rpcErr.message || 'Booking failed'
      if (msg.toLowerCase().includes('insufficient credits')) {
        throw createError({ statusCode: 402, statusMessage: msg })
      }
      if (msg.toLowerCase().includes('insufficient hold credits')) {
        throw createError({ statusCode: 402, statusMessage: 'No hold credits available. Buy additional holds to request an overnight hold.' })
      }
      if (rpcErr.code === '23P01') {
        throw createError({ statusCode: 409, statusMessage: 'Time slot not available' })
      }
      throw createError({ statusCode: 409, statusMessage: msg })
    }

    const resultRow = Array.isArray(rawResult)
      ? (rawResult[0] as Record<string, unknown> | undefined)
      : undefined
    const bookingId = typeof resultRow?.booking_id === 'string' ? resultRow.booking_id : null
    const holdId = typeof resultRow?.hold_id === 'string' ? resultRow.hold_id : null
    const burned = Number.isFinite(Number(resultRow?.credits_burned ?? NaN))
      ? Number(resultRow?.credits_burned)
      : null
    const newBalance = Number.isFinite(Number(resultRow?.new_balance ?? NaN))
      ? Number(resultRow?.new_balance)
      : null
    if (bookingId) {
      await enqueueBookingAccessSync(event, {
        bookingId,
        reason: 'admin_booking_create_on_behalf'
      }).catch((error) => {
        console.warn('[access/sync] failed to queue admin booking create sync', {
          bookingId,
          error: (error as Error)?.message ?? String(error)
        })
      })

      await maybeForceSyncGoogleCalendar(event, 'admin_booking_create_on_behalf').catch((error) => {
        console.warn('[gcal-sync] failed to force sync after admin booking create', {
          bookingId,
          error: (error as Error)?.message ?? String(error)
        })
      })
    }

    return {
      ok: true,
      burnCredits: true,
      creditsNeeded,
      bookingId,
      holdId,
      burned,
      newBalance
    }
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', body.userId)
    .maybeSingle()

  const { data: booking, error: bookingInsertErr } = await supabase
    .from('bookings')
    .insert({
      user_id: body.userId,
      customer_id: customer?.id ?? null,
      start_time: startIso,
      end_time: endIso,
      status: 'confirmed',
      notes: body.notes ?? null,
      credits_estimated: creditsNeeded,
      credits_burned: 0
    })
    .select('id')
    .single()
  if (bookingInsertErr) throw createError({ statusCode: 500, statusMessage: bookingInsertErr.message })

  let holdId: string | null = null

  if (body.requestHold && holdStartIso && holdEndIso) {
    const { data: holdRow, error: holdInsertErr } = await supabase
      .from('booking_holds')
      .insert({
        booking_id: booking.id,
        hold_start: holdStartIso,
        hold_end: holdEndIso,
        hold_type: 'overnight'
      })
      .select('id')
      .single()

    if (holdInsertErr) {
      await supabase.from('bookings').delete().eq('id', booking.id)
      throw createError({ statusCode: 500, statusMessage: holdInsertErr.message })
    }

    holdId = holdRow.id

    if (consumePaidHold) {
      const { error: holdLedgerErr } = await supabase
        .from('hold_ledger')
        .insert({
          user_id: body.userId,
          delta: -1,
          reason: 'booking_hold',
          external_ref: booking.id,
          metadata: {
            source: 'admin_booking_create_no_burn',
            booking_id: booking.id,
            hold_id: holdId
          }
        })
      if (holdLedgerErr) throw createError({ statusCode: 500, statusMessage: holdLedgerErr.message })
    }
  }

  await enqueueBookingAccessSync(event, {
    bookingId: booking.id,
    reason: 'admin_booking_create_on_behalf'
  }).catch((error) => {
    console.warn('[access/sync] failed to queue admin booking create sync', {
      bookingId: booking.id,
      error: (error as Error)?.message ?? String(error)
    })
  })

  await maybeForceSyncGoogleCalendar(event, 'admin_booking_create_on_behalf').catch((error) => {
    console.warn('[gcal-sync] failed to force sync after admin booking create', {
      bookingId: booking.id,
      error: (error as Error)?.message ?? String(error)
    })
  })

  return {
    ok: true,
    burnCredits: false,
    creditsNeeded,
    bookingId: booking.id,
    holdId,
    burned: 0,
    newBalance: remainingCredits
  }
})
