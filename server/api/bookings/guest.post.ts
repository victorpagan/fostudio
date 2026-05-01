/**
 * POST /api/bookings/guest
 *
 * Authenticated non-member booking flow.
 * - If the guest has enough credits, confirms and burns immediately.
 * - If credits are short, reserves the slot for a short payment window and
 *   sends the guest to Square for the credit shortfall.
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { DateTime } from 'luxon'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { isPeakByConfig, loadPeakWindowConfig, STUDIO_TZ } from '~~/server/utils/booking/peak'
import { ensureNoExternalCalendarConflict } from '~~/server/utils/booking/externalCalendar'
import { ensureSquareCustomerForUser, getPrimaryCustomerRowForUser } from '~~/server/utils/square/customer'
import { toSquareBuyerPhone } from '~~/server/utils/square/checkoutPrefill'
import { resolveAvailableCreditBalance } from '~~/server/utils/credits/availableBalance'
import { enqueueBookingAccessSync } from '~~/server/utils/access/jobs'
import { maybeForceSyncGoogleCalendar } from '~~/server/utils/integrations/googleCalendar'
import { sendMemberBookingLifecycleMail } from '~~/server/utils/mail/memberBookingLifecycle'
import { assertCurrentWaiver } from '~~/server/utils/waiver/status'
import {
  buildRatePolicySnapshot,
  loadGuestBookingPolicy,
  loadStandbyBookingPolicy,
  validateGuestBookingWindow,
  validateStandbySelection
} from '~~/server/utils/booking/guestPolicy'
import { isMembershipCurrentlyActive } from '~~/server/utils/membership/status'
import { expireStalePendingGuestBookings } from '~~/server/utils/booking/pendingPayments'

const bodySchema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  notes: z.string().max(500).optional().nullable(),
  rate_kind: z.enum(['standard', 'standby']).optional().default('standard')
})

type PaymentLinkResult = {
  paymentLink?: {
    id?: string | null
    url?: string | null
    orderId?: string | null
  } | null
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

function nameFromParts(first?: string | null, last?: string | null, email?: string | null) {
  const name = [first, last].map(value => String(value ?? '').trim()).filter(Boolean).join(' ').trim()
  return name || email || 'Guest'
}

function readSquareErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (!error || typeof error !== 'object') return 'Square request failed'
  const details = (error as { errors?: unknown }).errors
  if (!Array.isArray(details) || details.length === 0) return 'Square request failed'
  const first = details[0]
  if (!first || typeof first !== 'object') return 'Square request failed'
  const detail = (first as { detail?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  const code = (first as { code?: unknown }).code
  if (typeof code === 'string' && code.trim()) return code.trim()
  return 'Square request failed'
}

async function hasStandbyBookingToday(supabase: unknown, userId: string, start: DateTime) {
  type CountResult = { count?: number | null, error?: { message: string } | null }
  type CountQuery = PromiseLike<CountResult> & {
    eq: (column: string, value: unknown) => CountQuery
    gte: (column: string, value: unknown) => CountQuery
    in: (column: string, values: unknown[]) => CountQuery
    lt: (column: string, value: unknown) => CountQuery
    select: (columns?: string, options?: Record<string, unknown>) => CountQuery
  }
  const db = supabase as { from: (table: string) => CountQuery }
  const dayStart = start.setZone(STUDIO_TZ).startOf('day').toUTC().toISO()
  const dayEnd = start.setZone(STUDIO_TZ).startOf('day').plus({ days: 1 }).toUTC().toISO()
  if (!dayStart || !dayEnd) return false
  const { count, error } = await db
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('booking_rate_kind', 'standby')
    .in('status', ['confirmed', 'requested', 'pending_payment'])
    .gte('start_time', dayStart)
    .lt('start_time', dayEnd)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return Math.max(0, count ?? 0) > 0
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required before booking as a guest.' })

  const body = bodySchema.parse(await readBody(event))
  const supabase = serverSupabaseServiceRole(event)
  const peakWindow = await loadPeakWindowConfig(event)
  const guestPolicy = await loadGuestBookingPolicy(event)
  const standbyPolicy = await loadStandbyBookingPolicy(event)
  const rateKind = body.rate_kind ?? 'standard'

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,status,current_period_end,canceled_at')
    .eq('user_id', user.sub)
    .maybeSingle()
  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (isMembershipCurrentlyActive(membership)) {
    throw createError({ statusCode: 400, statusMessage: 'Active members should use the member booking flow.' })
  }
  await assertCurrentWaiver(event, user.sub)

  const start = DateTime.fromISO(body.start_time, { zone: STUDIO_TZ })
  const end = DateTime.fromISO(body.end_time, { zone: STUDIO_TZ })
  if (!start.isValid || !end.isValid || !(start < end)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid booking time.' })
  }

  const guestValidation = validateGuestBookingWindow({ start, end, policy: guestPolicy })
  if (!guestValidation.ok) {
    throw createError({ statusCode: 400, statusMessage: guestValidation.message ?? 'Guest booking is not available for this time.' })
  }

  if (rateKind === 'standby') {
    const standbyValidation = validateStandbySelection({
      start,
      end,
      accountKind: 'guest',
      guestPolicy,
      standbyPolicy
    })
    if (!standbyValidation.ok) {
      throw createError({ statusCode: 400, statusMessage: standbyValidation.message ?? 'Standby booking is not available for this time.' })
    }
    if (await hasStandbyBookingToday(supabase, user.sub, start)) {
      throw createError({ statusCode: 409, statusMessage: 'Only one standby booking is allowed per day.' })
    }
  }

  const startIso = start.toUTC().toISO()
  const endIso = end.toUTC().toISO()
  if (!startIso || !endIso) throw createError({ statusCode: 400, statusMessage: 'Invalid booking time.' })

  await expireStalePendingGuestBookings(supabase)
  await ensureNoExternalCalendarConflict(supabase, startIso, endIso)

  const { data: bookingConflicts, error: bookingConflictErr } = await supabase
    .from('bookings')
    .select('id')
    .in('status', ['confirmed', 'requested', 'pending_payment'])
    .lt('start_time', endIso)
    .gt('end_time', startIso)
    .limit(1)
  if (bookingConflictErr) throw createError({ statusCode: 500, statusMessage: bookingConflictErr.message })
  if (bookingConflicts?.length) throw createError({ statusCode: 409, statusMessage: 'That time slot is not available.' })

  const { data: holdConflicts, error: holdErr } = await supabase
    .from('booking_holds')
    .select('id')
    .lt('hold_start', endIso)
    .gt('hold_end', startIso)
    .limit(1)
  if (holdErr) throw createError({ statusCode: 500, statusMessage: holdErr.message })
  if (holdConflicts?.length) throw createError({ statusCode: 409, statusMessage: 'That time slot is not available.' })

  const { data: blockConflicts, error: blockErr } = await supabase
    .from('calendar_blocks')
    .select('id')
    .eq('active', true)
    .lt('start_time', endIso)
    .gt('end_time', startIso)
    .limit(1)
  if (blockErr) throw createError({ statusCode: 500, statusMessage: blockErr.message })
  if (blockConflicts?.length) throw createError({ statusCode: 409, statusMessage: 'That time slot is blocked by studio admin.' })

  await ensureSquareCustomerForUser(event, {
    userId: user.sub,
    email: user.email ?? null,
    firstName: typeof user.user_metadata?.first_name === 'string' ? user.user_metadata.first_name : null,
    lastName: typeof user.user_metadata?.last_name === 'string' ? user.user_metadata.last_name : null
  })
  const customer = await getPrimaryCustomerRowForUser(event, user.sub)
  if (!customer?.id) throw createError({ statusCode: 400, statusMessage: 'Customer profile missing.' })

  const baseCreditsNeeded = computeCredits(body.start_time, body.end_time, guestPolicy.peakMultiplier, peakWindow)
  const creditsNeeded = rateKind === 'standby'
    ? Math.round(baseCreditsNeeded * standbyPolicy.discountMultiplier * 100) / 100
    : baseCreditsNeeded
  const remainingCredits = await resolveAvailableCreditBalance(supabase, user.sub)
  const shortfallCredits = Math.max(0, Math.round((creditsNeeded - remainingCredits) * 100) / 100)
  const ratePolicySnapshot = buildRatePolicySnapshot({
    accountKind: 'guest',
    rateKind,
    guestPolicy,
    standbyPolicy: rateKind === 'standby' ? standbyPolicy : null
  })

  if (shortfallCredits <= 0) {
    const { data: rawResult, error: rpcErr } = await supabase.rpc('create_confirmed_booking_with_burn_no_membership' as never, {
      p_user_id: user.sub,
      p_customer_id: customer.id,
      p_start_time: startIso,
      p_end_time: endIso,
      p_notes: (body.notes ?? '') as string,
      p_credits_needed: creditsNeeded,
      p_booking_kind: 'standard',
      p_workshop_title: null,
      p_workshop_description: null,
      p_workshop_link: null,
      p_workshop_liability_accepted_at: null
    } as never)
    const result = rawResult as unknown as Array<{ booking_id: string | null, credits_burned: number | null, new_balance: number | null }> | null
    if (rpcErr) {
      const msg = rpcErr.message || 'Booking failed'
      if (msg.toLowerCase().includes('insufficient credits')) {
        throw createError({ statusCode: 402, statusMessage: 'Insufficient credits' })
      }
      throw createError({ statusCode: 409, statusMessage: msg })
    }

    const bookingId = result?.[0]?.booking_id ?? null
    if (bookingId) {
      await supabase
        .from('bookings')
        .update({
          booking_rate_kind: rateKind,
          rate_policy_snapshot: ratePolicySnapshot
        } as never)
        .eq('id', bookingId)

      await enqueueBookingAccessSync(event, { bookingId, reason: 'guest_booking_create' }).catch((error) => {
        console.warn('[guest-booking] access sync failed', { bookingId, error })
      })
      await maybeForceSyncGoogleCalendar(event, 'guest_booking_create').catch((error) => {
        console.warn('[guest-booking] google sync failed', { bookingId, error })
      })
      await sendMemberBookingLifecycleMail(event, {
        eventType: 'booking.memberCreated',
        userId: user.sub,
        bookingId,
        bookingStart: startIso,
        bookingEnd: endIso,
        creditsBurned: Number(result?.[0]?.credits_burned ?? creditsNeeded),
        holdRequested: false,
        holdCreated: false,
        actionedBy: 'member'
      })
    }

    return {
      ok: true,
      status: 'confirmed',
      bookingId,
      creditsNeeded,
      shortfallCredits: 0,
      amountDueCents: 0,
      newBalance: result?.[0]?.new_balance ?? null,
      checkoutUrl: null
    }
  }

  const amountDueCents = Math.ceil(shortfallCredits * guestPolicy.ratePerCreditCents)
  const paymentExpiresAt = DateTime.now().setZone(STUDIO_TZ).plus({ minutes: guestPolicy.pendingPaymentHoldMinutes }).toUTC().toISO()
  const guestName = nameFromParts(customer.first_name, customer.last_name, customer.email ?? user.email ?? null)
  const guestEmail = customer.email ?? user.email ?? null

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      user_id: user.sub,
      customer_id: customer.id,
      start_time: startIso,
      end_time: endIso,
      status: 'pending_payment',
      notes: body.notes ?? null,
      credits_estimated: creditsNeeded,
      credits_burned: creditsNeeded,
      guest_name: guestName,
      guest_email: guestEmail,
      payment_expires_at: paymentExpiresAt,
      booking_rate_kind: rateKind,
      rate_policy_snapshot: ratePolicySnapshot
    } as never)
    .select('id')
    .single()
  if (bookingErr || !booking) {
    throw createError({ statusCode: 500, statusMessage: bookingErr?.message ?? 'Failed to reserve booking.' })
  }

  const token = randomUUID()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: topupSession, error: topupErr } = await (supabase as any)
    .from('credit_topup_sessions')
    .insert({
      token,
      user_id: user.sub,
      membership_id: null,
      credits: shortfallCredits,
      amount_cents: amountDueCents,
      currency: 'USD',
      status: 'pending',
      payment_provider: 'square',
      metadata: {
        source: 'guest_booking_shortfall',
        booking_id: booking.id,
        credits_needed: creditsNeeded,
        existing_credit_balance: remainingCredits,
        shortfall_credits: shortfallCredits,
        guest_credit_expiry_days: guestPolicy.creditExpiryDays,
        booking_rate_kind: rateKind
      }
    })
    .select('id,token')
    .single()

  if (topupErr || !topupSession) {
    await supabase.from('bookings').delete().eq('id', booking.id)
    throw createError({ statusCode: 500, statusMessage: topupErr?.message ?? 'Failed to create guest payment session.' })
  }

  const square = await useSquareClient(event)
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
  const { origin } = getRequestURL(event)
  const redirectUrl = `${origin}/checkout/booking-success?booking_id=${encodeURIComponent(booking.id)}&guest_payment=${encodeURIComponent(topupSession.token)}`
  const startLabel = start.toFormat('EEE MMM d h:mm a')
  const durationHours = end.diff(start, 'hours').hours
  const durationLabel = Number.isInteger(durationHours) ? `${durationHours}h` : `${durationHours.toFixed(1)}h`

  let createRes: PaymentLinkResult
  try {
    createRes = await square.checkout.paymentLinks.create({
      idempotencyKey: randomUUID(),
      quickPay: {
        name: `FO Studio guest booking credits — ${startLabel} (${durationLabel})`,
        priceMoney: {
          amount: BigInt(amountDueCents),
          currency: 'USD'
        },
        locationId
      },
      checkoutOptions: { redirectUrl },
      paymentNote: `guest_booking_id:${booking.id};topup_token:${topupSession.token}`,
      prePopulatedData: {
        buyerEmail: guestEmail ?? undefined,
        buyerPhoneNumber: toSquareBuyerPhone(customer.phone),
        buyerAddress: {
          firstName: customer.first_name ?? undefined,
          lastName: customer.last_name ?? undefined
        }
      }
    } as never) as PaymentLinkResult
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('credit_topup_sessions').update({ status: 'failed' }).eq('id', topupSession.id)
    await supabase.from('bookings').delete().eq('id', booking.id)
    throw createError({
      statusCode: 502,
      statusMessage: `Failed to create guest checkout: ${readSquareErrorMessage(error)}`
    })
  }

  const paymentLink = createRes.paymentLink
  if (!paymentLink?.url) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('credit_topup_sessions').update({ status: 'failed' }).eq('id', topupSession.id)
    await supabase.from('bookings').delete().eq('id', booking.id)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create payment link.' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('credit_topup_sessions')
    .update({
      payment_link_id: paymentLink.id ?? null,
      order_template_id: paymentLink.orderId ?? null
    })
    .eq('id', topupSession.id)
  await supabase
    .from('bookings')
    .update({ square_order_id: paymentLink.orderId ?? null } as never)
    .eq('id', booking.id)

  return {
    ok: true,
    status: 'pending_payment',
    bookingId: booking.id,
    topupToken: topupSession.token,
    creditsNeeded,
    shortfallCredits,
    amountDueCents,
    paymentExpiresAt,
    checkoutUrl: paymentLink.url
  }
})
