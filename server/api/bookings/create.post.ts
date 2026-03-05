import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import { isPeakByConfig, loadPeakWindowConfig, STUDIO_TZ } from '~~/server/utils/booking/peak'

const schema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  notes: z.string().optional().nullable(),
  request_hold: z.boolean().optional().default(false)
})

const TEST_TIER_ID = 'test'

type TierRules = {
  booking_window_days: number
  peak_multiplier: number
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

  const supabase = await serverSupabaseClient(event)
  const body = schema.parse(await readBody(event))

  // Membership active + tier id
  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .select('status,tier')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (memErr) throw createError({ statusCode: 500, statusMessage: memErr.message })
  if (!membership || (membership.status || '').toLowerCase() !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'Membership required' })
  }

  // Tier rules (DB catalog)
  const { data: tierRow, error: tierErr } = await supabase
    .from('membership_tiers')
    .select('booking_window_days, peak_multiplier')
    .eq('id', membership.tier)
    .maybeSingle()

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })

  // Some pre-launch environments may have an active test membership without
  // a seeded membership_tiers('test') row. Allow safe defaults for that tier.
  const effectiveTier: TierRules | null = tierRow
    ? {
        booking_window_days: Number(tierRow.booking_window_days ?? 30),
        peak_multiplier: Number(tierRow.peak_multiplier ?? 1.5)
      }
    : membership.tier === TEST_TIER_ID
      ? {
          booking_window_days: 30,
          peak_multiplier: 1
        }
      : null

  if (!effectiveTier) throw createError({ statusCode: 400, statusMessage: 'Tier configuration missing' })

  const start = DateTime.fromISO(body.start_time, { zone: STUDIO_TZ })
  const end = DateTime.fromISO(body.end_time, { zone: STUDIO_TZ })
  if (!start.isValid || !end.isValid) throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })
  if (!(start < end)) throw createError({ statusCode: 400, statusMessage: 'Invalid time range' })

  // Booking window enforcement
  const now = DateTime.now().setZone(STUDIO_TZ)
  const maxStart = now.plus({ days: effectiveTier.booking_window_days })
  if (start > maxStart) {
    throw createError({
      statusCode: 403,
      statusMessage: `Your plan allows booking up to ${effectiveTier.booking_window_days} days ahead.`
    })
  }

  // Compute credits
  const creditsNeeded = computeCredits(body.start_time, body.end_time, effectiveTier.peak_multiplier, peakWindow)

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

  // Customer id for linkage
  const { data: cust, error: custErr } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (custErr) throw createError({ statusCode: 500, statusMessage: custErr.message })
  if (!cust?.id) throw createError({ statusCode: 400, statusMessage: 'Customer profile missing' })

  // Call atomic RPC (booking + burn + hold)
  const { data: result, error: rpcErr } = await supabase.rpc('create_confirmed_booking_with_burn', {
    p_user_id: user.sub,
    p_customer_id: cust.id,
    p_start_time: start.toUTC().toISO()!, // non-null — valid Luxon DT guaranteed above
    p_end_time: end.toUTC().toISO()!,
    p_notes: (body.notes ?? '') as string,
    p_request_hold: body.request_hold ?? false,
    p_credits_needed: creditsNeeded
  })

  if (rpcErr) {
    // Constraint overlap or insufficient credits or hold overlap errors surface here
    const msg = rpcErr.message || 'Booking failed'
    if (msg.toLowerCase().includes('insufficient credits')) {
      throw createError({ statusCode: 402, statusMessage: 'Insufficient credits' })
    }
    if (rpcErr.code === '23P01') {
      throw createError({ statusCode: 409, statusMessage: 'Time slot not available' })
    }
    throw createError({ statusCode: 409, statusMessage: msg })
  }

  return {
    ok: true,
    creditsNeeded,
    burned: result?.[0]?.credits_burned ?? null,
    newBalance: result?.[0]?.new_balance ?? null,
    booking_id: result?.[0]?.booking_id ?? null,
    hold_id: result?.[0]?.hold_id ?? null
  }
})
  const peakWindow = await loadPeakWindowConfig(event)
