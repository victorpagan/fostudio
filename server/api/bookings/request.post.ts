import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import {
  computeOvernightHoldWindow,
  DEFAULT_HOLD_END_HOUR,
  DEFAULT_HOLD_MIN_END_HOUR,
  DEFAULT_MIN_HOLD_BOOKING_HOURS,
  resolveHoldCycleWindow,
  validateOvernightHoldWindow
} from '~~/server/utils/booking/holds'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'
import { resolveAvailableCreditBalance } from '~~/server/utils/credits/availableBalance'

const schema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  notes: z.string().optional(),
  request_hold: z.boolean().optional().default(false)
})
function isSchemaMissingColumnError(message: string) {
  return /column .* does not exist/i.test(message) || /relation .* does not exist/i.test(message)
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const supabase = serverSupabaseServiceRole(event)
  const db = supabase as any
  const body = schema.parse(await readBody(event))

  const start = DateTime.fromISO(body.start_time, { zone: STUDIO_TZ })
  const end = DateTime.fromISO(body.end_time, { zone: STUDIO_TZ })
  if (!start.isValid || !end.isValid) throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })
  if (!(start < end)) throw createError({ statusCode: 400, statusMessage: 'Invalid time range' })
  const now = DateTime.now().setZone(STUDIO_TZ)
  if (start < now) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot book in the past' })
  }

  const startIso = start.toUTC().toISO()
  const endIso = end.toUTC().toISO()
  if (!startIso || !endIso) throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })

  // membership/credits access check
  const { data: membership } = await supabase
    .from('memberships')
    .select('status,tier,current_period_start,current_period_end')
    .eq('user_id', user.sub)
    .maybeSingle()

  let remainingCredits = 0
  try {
    remainingCredits = await resolveAvailableCreditBalance(supabase, user.sub)
  } catch (error: any) {
    throw createError({ statusCode: 500, statusMessage: error?.message ?? 'Failed to load credits' })
  }
  const hasActiveMembership = (membership?.status || '').toLowerCase() === 'active'
  if (!hasActiveMembership && remainingCredits <= 0) {
    throw createError({ statusCode: 403, statusMessage: 'Membership required' })
  }

  const selectWithCap = 'holds_included,active_hold_cap'
  const selectLegacy = 'holds_included'
  let tier: Record<string, unknown> | null = null
  let tierErr: { message: string } | null = null
  if (membership?.tier) {
    const primary = await db
      .from('membership_tiers')
      .select(selectWithCap)
      .eq('id', membership.tier)
      .maybeSingle()
    tier = primary.data
    tierErr = primary.error
    if (tierErr && isSchemaMissingColumnError(tierErr.message)) {
      const fallback = await db
        .from('membership_tiers')
        .select(selectLegacy)
        .eq('id', membership.tier)
        .maybeSingle()
      tier = fallback.data
      tierErr = fallback.error
    }
  }
  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })
  const holdsIncluded = Math.max(0, Number(tier?.holds_included ?? 0))
  const activeHoldCap = Math.max(0, Number((tier as Record<string, unknown> | null)?.active_hold_cap ?? 0))

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
    .neq('bookings.user_id', user.sub)
    .limit(1)

  if (holdErr) throw createError({ statusCode: 500, statusMessage: holdErr.message })
  if (holdConflicts && holdConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Time slot is blocked by an equipment hold' })
  }

  let holdStartIso: string | null = null
  let holdEndIso: string | null = null

  if (body.request_hold) {
    const { data: holdConfigRows, error: holdConfigErr } = await supabase
      .from('system_config')
      .select('key,value')
      .in('key', ['min_hold_booking_hours', 'hold_min_end_hour', 'hold_end_hour'])
    if (holdConfigErr) throw createError({ statusCode: 500, statusMessage: holdConfigErr.message })
    const holdConfig = new Map((holdConfigRows ?? []).map(row => [String(row.key), row.value]))
    const minHoldBookingHours = Math.max(1, Number(holdConfig.get('min_hold_booking_hours') ?? DEFAULT_MIN_HOLD_BOOKING_HOURS))
    const holdMinEndHour = Math.max(0, Math.min(23, Math.floor(Number(holdConfig.get('hold_min_end_hour') ?? DEFAULT_HOLD_MIN_END_HOUR))))
    const holdEndHour = Math.max(0, Math.min(23, Math.floor(Number(holdConfig.get('hold_end_hour') ?? DEFAULT_HOLD_END_HOUR))))
    const holdWindowValidation = validateOvernightHoldWindow(start, end, minHoldBookingHours, holdMinEndHour)
    if (!holdWindowValidation.ok) {
      throw createError({ statusCode: 409, statusMessage: holdWindowValidation.message })
    }

    if (activeHoldCap <= 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Your current membership does not allow active equipment holds.'
      })
    }

    if (!membership || !hasActiveMembership) {
      throw createError({ statusCode: 403, statusMessage: 'Overnight holds require an active membership' })
    }

    const nowIso = new Date().toISOString()
    const { count: activeHoldCount, error: activeHoldCountErr } = await supabase
      .from('booking_holds')
      .select('id, bookings!inner(user_id,status)', { count: 'exact', head: true })
      .eq('bookings.user_id', user.sub)
      .in('bookings.status', ['confirmed', 'requested', 'pending_payment'])
      .gt('hold_end', nowIso)

    if (activeHoldCountErr) throw createError({ statusCode: 500, statusMessage: activeHoldCountErr.message })
    const activeHolds = Math.max(0, activeHoldCount ?? 0)
    if (activeHolds >= activeHoldCap) {
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
      .eq('bookings.user_id', user.sub)
      .not('bookings.status', 'eq', 'canceled')
      .gte('hold_start', holdCycle.startIso)
      .lt('hold_start', holdCycle.endIso)

    if (usedHoldsErr) throw createError({ statusCode: 500, statusMessage: usedHoldsErr.message })
    const usedHoldsThisCycle = Math.max(0, usedHoldsCount ?? 0)
    const includedHoldsRemaining = Math.max(0, holdsIncluded - usedHoldsThisCycle)
    if (includedHoldsRemaining <= 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Monthly hold cap reached. Buy additional holds or use the instant booking flow with credit fallback.'
      })
    }

    const holdWindow = computeOvernightHoldWindow(end, holdEndHour)
    holdStartIso = holdWindow.holdStartIso
    holdEndIso = holdWindow.holdEndIso
    if (!holdStartIso || !holdEndIso) throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })

    const { data: holdWindowBookingConflicts, error: holdWindowBookingErr } = await supabase
      .from('bookings')
      .select('id')
      .in('status', ['confirmed', 'requested', 'pending_payment'])
      .lt('start_time', holdEndIso)
      .gt('end_time', holdStartIso)
      .neq('user_id', user.sub)
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

  // fetch customer id for linkage
  const { data: cust } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.sub)
    .maybeSingle()

  // insert booking request
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      user_id: user.sub,
      customer_id: cust?.id ?? null,
      start_time: startIso,
      end_time: endIso,
      status: 'requested',
      notes: body.notes ?? null
    })
    .select('*')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  // optional hold request
  if (body.request_hold) {
    if (!holdStartIso || !holdEndIso) throw createError({ statusCode: 500, statusMessage: 'Could not resolve hold window' })

    const { error: holdErr } = await supabase
      .from('booking_holds')
      .insert({
        booking_id: booking.id,
        hold_start: holdStartIso,
        hold_end: holdEndIso,
        hold_type: 'overnight'
      })

    if (holdErr) {
      // booking is created, hold failed; return with warning
      return { ok: true, booking, holdCreated: false, holdError: holdErr.message }
    }
  }

  return { ok: true, booking, holdCreated: body.request_hold }
})
