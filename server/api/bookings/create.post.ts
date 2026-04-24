import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'
import { isAdminRole, readUserRole } from '~~/server/utils/auth'
import type { RoleCarrier } from '~~/server/utils/auth'
import { isPeakByConfig, loadPeakWindowConfig, STUDIO_TZ } from '~~/server/utils/booking/peak'
import { ensureNoExternalCalendarConflict } from '~~/server/utils/booking/externalCalendar'
import {
  computeOvernightHoldWindow,
  DEFAULT_HOLD_END_HOUR,
  DEFAULT_HOLD_MIN_END_HOUR,
  DEFAULT_MIN_HOLD_BOOKING_HOURS,
  resolveHoldCycleWindow,
  validateOvernightHoldWindow
} from '~~/server/utils/booking/holds'
import { resolveAvailableCreditBalance } from '~~/server/utils/credits/availableBalance'
import { assertCurrentWaiver } from '~~/server/utils/waiver/status'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'
import { maybeForceSyncGoogleCalendar } from '~~/server/utils/integrations/googleCalendar'
import { sendMemberBookingLifecycleMail } from '~~/server/utils/mail/memberBookingLifecycle'

const schema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  notes: z.string().optional().nullable(),
  booking_kind: z.enum(['standard', 'workshop']).optional().default('standard'),
  workshop_title: z.string().max(160).optional().nullable(),
  workshop_description: z.string().max(2000).optional().nullable(),
  workshop_link: z.string().max(500).optional().nullable(),
  workshop_liability_acknowledged: z.boolean().optional().default(false),
  request_hold: z.boolean().optional().default(false),
  hold_payment_method: z.enum(['auto', 'token', 'credits']).optional().default('auto')
})

const TEST_TIER_ID = 'test'
const WORKSHOP_BOOKING_WINDOW_MONTHS = 3
type TierRules = {
  booking_window_days: number
  peak_multiplier: number
  holds_included: number
  active_hold_cap: number
}

type TierRow = {
  booking_window_days: number | null
  peak_multiplier: number | null
  holds_included: number | null
  active_hold_cap?: number | null
}

type CustomerWorkshopRow = {
  id: string
  workshop_booking_enabled: boolean | null
}

function isThirtyMinuteAligned(dateTime: DateTime) {
  if (!dateTime.isValid) return false
  if (dateTime.second !== 0 || dateTime.millisecond !== 0) return false
  return dateTime.minute % 30 === 0
}

function isSchemaMissingColumnError(message: string) {
  return /column .* does not exist/i.test(message) || /relation .* does not exist/i.test(message)
}

// Credits: baseline 1 credit/hour off-peak; peak multiplier applies per 15-min bucket
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

  // Round to 2 decimals for display/debug; burn uses ceil() in SQL
  return Math.round(credits * 100) / 100
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  const role = readUserRole(user as RoleCarrier)
  const isAdmin = isAdminRole(role)
  if (!isAdmin) {
    await assertCurrentWaiver(event, user.sub)
  }

  const supabase = serverSupabaseServiceRole(event)
  const body = schema.parse(await readBody(event))
  const peakWindow = await loadPeakWindowConfig(event)
  const bookingKind = body.booking_kind ?? 'standard'
  const workshopTitle = typeof body.workshop_title === 'string' ? body.workshop_title.trim() : ''
  const workshopDescription = typeof body.workshop_description === 'string' ? body.workshop_description.trim() : ''
  const workshopLink = typeof body.workshop_link === 'string' ? body.workshop_link.trim() : ''
  const workshopLiabilityAcceptedAt = bookingKind === 'workshop' && body.workshop_liability_acknowledged
    ? new Date().toISOString()
    : null

  const { data: holdConfigRows, error: holdConfigErr } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', ['hold_credit_cost', 'min_hold_booking_hours', 'hold_min_end_hour', 'hold_end_hour', 'workshop_credit_multiplier'])

  if (holdConfigErr) throw createError({ statusCode: 500, statusMessage: holdConfigErr.message })
  const holdConfig = new Map((holdConfigRows ?? []).map(row => [String(row.key), row.value]))
  const holdCreditCost = Math.max(0, Number(holdConfig.get('hold_credit_cost') ?? 2))
  const minHoldBookingHours = Math.max(1, Number(holdConfig.get('min_hold_booking_hours') ?? DEFAULT_MIN_HOLD_BOOKING_HOURS))
  const holdMinEndHour = Math.max(0, Math.min(23, Math.floor(Number(holdConfig.get('hold_min_end_hour') ?? DEFAULT_HOLD_MIN_END_HOUR))))
  const holdEndHour = Math.max(0, Math.min(23, Math.floor(Number(holdConfig.get('hold_end_hour') ?? DEFAULT_HOLD_END_HOUR))))
  const workshopCreditMultiplier = Math.max(1, Number(holdConfig.get('workshop_credit_multiplier') ?? 2))

  if (bookingKind === 'workshop') {
    if (!body.workshop_liability_acknowledged) {
      throw createError({ statusCode: 400, statusMessage: 'You must acknowledge workshop liability before booking.' })
    }
    if (workshopLink && !/^https?:\/\//i.test(workshopLink)) {
      throw createError({ statusCode: 400, statusMessage: 'Workshop link must start with http:// or https://.' })
    }
  }

  // Membership + tier id (membership can be missing for legacy/admin accounts with credits)
  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .select('status,tier,current_period_start,current_period_end')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (memErr) throw createError({ statusCode: 500, statusMessage: memErr.message })
  let remainingCredits = 0
  try {
    remainingCredits = await resolveAvailableCreditBalance(supabase, user.sub)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load credits'
    throw createError({ statusCode: 500, statusMessage: message })
  }
  const hasActiveMembership = (membership?.status || '').toLowerCase() === 'active'
  if (!hasActiveMembership && remainingCredits <= 0) {
    throw createError({ statusCode: 403, statusMessage: 'Membership required' })
  }

  // Tier rules (DB catalog)
  const selectWithCap = 'booking_window_days, peak_multiplier, holds_included, active_hold_cap'
  const selectLegacy = 'booking_window_days, peak_multiplier, holds_included'
  const tierWithCapResult = await supabase
    .from('membership_tiers')
    .select(selectWithCap)
    .eq('id', membership?.tier ?? '')
    .maybeSingle()
  let tierRow = tierWithCapResult.data as unknown as TierRow | null
  let tierErr = tierWithCapResult.error

  if (tierErr && isSchemaMissingColumnError(tierErr.message)) {
    const fallbackResult = await supabase
      .from('membership_tiers')
      .select(selectLegacy)
      .eq('id', membership?.tier ?? '')
      .maybeSingle()
    tierRow = fallbackResult.data as unknown as TierRow | null
    tierErr = fallbackResult.error
  }

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })

  // Some pre-launch environments may have an active test membership without
  // a seeded membership_tiers('test') row. Allow safe defaults for that tier.
  let effectiveTier: TierRules | null = null
  if (tierRow) {
    effectiveTier = {
      booking_window_days: Number(tierRow.booking_window_days ?? 30),
      peak_multiplier: Number(tierRow.peak_multiplier ?? 1.5),
      holds_included: Number(tierRow.holds_included ?? 0),
      active_hold_cap: Number((tierRow as Record<string, unknown>).active_hold_cap ?? 0)
    }
  } else if (membership?.tier === TEST_TIER_ID) {
    effectiveTier = {
      booking_window_days: 30,
      peak_multiplier: 1,
      holds_included: 1,
      active_hold_cap: 1
    }
  } else if (!membership && remainingCredits > 0) {
    effectiveTier = {
      booking_window_days: 30,
      peak_multiplier: 1.5,
      holds_included: 0,
      active_hold_cap: 0
    }
  }

  if (!effectiveTier) throw createError({ statusCode: 400, statusMessage: 'Tier configuration missing' })

  const start = DateTime.fromISO(body.start_time, { zone: STUDIO_TZ })
  const end = DateTime.fromISO(body.end_time, { zone: STUDIO_TZ })
  if (!start.isValid || !end.isValid) throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })
  if (!(start < end)) throw createError({ statusCode: 400, statusMessage: 'Invalid time range' })
  if (!isAdmin) {
    const durationMinutes = end.diff(start, 'minutes').minutes
    if (!isThirtyMinuteAligned(start) || !isThirtyMinuteAligned(end)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Member bookings must start and end on 30-minute increments.'
      })
    }
    if (durationMinutes < 30) {
      throw createError({ statusCode: 400, statusMessage: 'Minimum booking is 30 minutes.' })
    }
  }

  const now = DateTime.now().setZone(STUDIO_TZ)
  if (start < now) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot book in the past' })
  }

  // Booking window enforcement
  const maxStart = bookingKind === 'workshop'
    ? now.plus({ months: WORKSHOP_BOOKING_WINDOW_MONTHS })
    : now.plus({ days: effectiveTier.booking_window_days })
  if (start > maxStart) {
    throw createError({
      statusCode: 403,
      statusMessage: bookingKind === 'workshop'
        ? 'Workshop bookings can only be made up to 3 months ahead.'
        : `Your plan allows booking up to ${effectiveTier.booking_window_days} days ahead.`
    })
  }

  // Compute credits
  const baseCreditsNeeded = computeCredits(body.start_time, body.end_time, effectiveTier.peak_multiplier, peakWindow)
  const creditsNeeded = bookingKind === 'workshop'
    ? Math.round(baseCreditsNeeded * workshopCreditMultiplier * 100) / 100
    : baseCreditsNeeded

  const { data: blockConflicts, error: blockErr } = await supabase
    .from('calendar_blocks')
    .select('id')
    .eq('active', true)
    .lt('start_time', end.toUTC().toISO())
    .gt('end_time', start.toUTC().toISO())
    .limit(1)

  if (blockErr) throw createError({ statusCode: 500, statusMessage: blockErr.message })
  if (blockConflicts && blockConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Time slot is blocked by studio admin' })
  }

  const startIso = start.toUTC().toISO()
  const endIso = end.toUTC().toISO()
  if (!startIso || !endIso) throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })

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
    .neq('bookings.user_id', user.sub)
    .limit(1)

  if (holdErr) throw createError({ statusCode: 500, statusMessage: holdErr.message })
  if (holdConflicts && holdConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'Time slot is blocked by an equipment hold' })
  }

  let consumePaidHold = false
  let holdCreditCharge = 0
  if (body.request_hold) {
    const holdWindowValidation = validateOvernightHoldWindow(start, end, minHoldBookingHours, holdMinEndHour)
    if (!holdWindowValidation.ok) {
      throw createError({ statusCode: 409, statusMessage: holdWindowValidation.message })
    }

    if (!hasActiveMembership) {
      throw createError({ statusCode: 403, statusMessage: 'Overnight holds require an active membership' })
    }

    const activeHoldCap = Math.max(0, Number(effectiveTier.active_hold_cap ?? 0))
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
      periodStartIso: membership?.current_period_start ?? null,
      periodEndIso: membership?.current_period_end ?? null
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
    const includedHoldsRemaining = Math.max(0, effectiveTier.holds_included - usedHoldsThisCycle)

    if (includedHoldsRemaining <= 0) {
      const { data: holdBalanceRow, error: holdBalanceErr } = await supabase
        .from('hold_balance')
        .select('balance')
        .eq('user_id', user.sub)
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

    const { holdStartIso, holdEndIso } = computeOvernightHoldWindow(end, holdEndHour)
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

  // Customer id for linkage
  const { data: custRaw, error: custErr } = await supabase
    .from('customers' as never)
    .select('id,workshop_booking_enabled')
    .eq('user_id', user.sub)
    .maybeSingle()
  const cust = custRaw as unknown as CustomerWorkshopRow | null

  if (custErr) throw createError({ statusCode: 500, statusMessage: custErr.message })
  if (!cust?.id) throw createError({ statusCode: 400, statusMessage: 'Customer profile missing' })
  if (bookingKind === 'workshop' && !cust.workshop_booking_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Workshop booking is not enabled for your account.' })
  }

  const rpcName = membership ? 'create_confirmed_booking_with_burn' : 'create_confirmed_booking_with_burn_no_membership'
  const rpcBody = membership
    ? {
        p_user_id: user.sub,
        p_customer_id: cust.id,
        p_start_time: startIso,
        p_end_time: endIso,
        p_notes: (body.notes ?? '') as string,
        p_request_hold: body.request_hold ?? false,
        p_credits_needed: creditsNeeded,
        p_consume_paid_hold: consumePaidHold,
        p_hold_credit_cost: holdCreditCharge,
        p_booking_kind: bookingKind,
        p_workshop_title: workshopTitle || null,
        p_workshop_description: workshopDescription || null,
        p_workshop_link: workshopLink || null,
        p_workshop_liability_accepted_at: workshopLiabilityAcceptedAt
      }
    : {
        p_user_id: user.sub,
        p_customer_id: cust.id,
        p_start_time: startIso,
        p_end_time: endIso,
        p_notes: (body.notes ?? '') as string,
        p_credits_needed: creditsNeeded,
        p_booking_kind: bookingKind,
        p_workshop_title: workshopTitle || null,
        p_workshop_description: workshopDescription || null,
        p_workshop_link: workshopLink || null,
        p_workshop_liability_accepted_at: workshopLiabilityAcceptedAt
      }

  // Call atomic RPC (booking + burn + optional hold)
  const { data: resultRaw, error: rpcErr } = await supabase.rpc(rpcName as never, rpcBody as never)
  const result = resultRaw as unknown as Array<{
    booking_id: string | null
    hold_id: string | null
    credits_burned: number | null
    new_balance: number | null
  }> | null

  if (rpcErr) {
    // Constraint overlap or insufficient credits or hold overlap errors surface here
    const msg = rpcErr.message || 'Booking failed'
    if (msg.toLowerCase().includes('insufficient credits')) {
      throw createError({ statusCode: 402, statusMessage: 'Insufficient credits' })
    }
    if (msg.toLowerCase().includes('insufficient hold credits')) {
      throw createError({ statusCode: 402, statusMessage: 'No hold credits available. Buy additional holds to request an overnight hold.' })
    }
    if (msg.toLowerCase().includes('hold limit reached')) {
      throw createError({ statusCode: 409, statusMessage: msg })
    }
    if (msg.toLowerCase().includes('does not include overnight equipment holds')) {
      throw createError({ statusCode: 403, statusMessage: msg })
    }
    if (msg.toLowerCase().includes('workshop liability acknowledgement is required')) {
      throw createError({ statusCode: 400, statusMessage: msg })
    }
    if (rpcErr.code === '23P01') {
      throw createError({ statusCode: 409, statusMessage: 'Time slot not available' })
    }
    throw createError({ statusCode: 409, statusMessage: msg })
  }

  const bookingId = result?.[0]?.booking_id ?? null
  if (bookingId) {
    await enqueueBookingAccessSync(event, {
      bookingId,
      reason: 'member_booking_create'
    }).catch((error) => {
      console.warn('[access/sync] failed to queue booking create sync', {
        bookingId,
        error: (error as Error)?.message ?? String(error)
      })
    })

    await maybeForceSyncGoogleCalendar(event, 'member_booking_create').catch((error) => {
      console.warn('[gcal-sync] failed to force sync after member booking create', {
        bookingId,
        error: (error as Error)?.message ?? String(error)
      })
    })

    await sendMemberBookingLifecycleMail(event, {
      eventType: 'booking.memberCreated',
      userId: user.sub,
      bookingId,
      bookingStart: startIso,
      bookingEnd: endIso,
      creditsBurned: Number(result?.[0]?.credits_burned ?? creditsNeeded),
      holdRequested: Boolean(body.request_hold),
      holdCreated: Boolean(result?.[0]?.hold_id),
      actionedBy: 'member'
    })
  }

  return {
    ok: true,
    creditsNeeded,
    bookingKind,
    workshopCreditMultiplier: bookingKind === 'workshop' ? workshopCreditMultiplier : 1,
    burned: result?.[0]?.credits_burned ?? null,
    newBalance: result?.[0]?.new_balance ?? null,
    booking_id: bookingId,
    hold_id: membership ? (result?.[0]?.hold_id ?? null) : null
  }
})
