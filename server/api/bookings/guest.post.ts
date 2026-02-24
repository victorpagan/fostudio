/**
 * POST /api/bookings/guest
 *
 * Guest (non-member) booking flow.
 * 1. Validates the requested time window.
 * 2. Computes the cost at the guest rate (flat peak multiplier, no tier discount).
 * 3. Creates a Square payment link for the one-time studio-time purchase.
 * 4. Inserts a 'pending_payment' booking row linked to the Square order.
 * 5. Returns the Square checkout URL.
 *
 * After payment, the Square webhook (invoice.payment_completed / payment.completed)
 * is responsible for flipping the booking status to 'confirmed'.
 *
 * Guest rate is configured in system_config:
 *   key = 'guest_booking_rate_per_credit_cents'  (e.g. 3500 = $35/credit)
 *   key = 'guest_peak_multiplier'                (e.g. 2.0)
 *
 * 1 credit = 1 off-peak hour. Peak multiplier applies the same 15-min bucket logic.
 */
import { z } from 'zod'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import { serverSupabaseClient } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfigMap } from '~~/server/utils/config/secret'

const TZ = 'America/Los_Angeles'

const bodySchema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  guest_name: z.string().min(1).max(100),
  guest_email: z.string().email(),
  notes: z.string().max(500).optional().nullable()
})

// Peak: Mon–Thu, 11:00–16:00 local — same rule as member bookings
function isPeak(dt: DateTime) {
  const weekday = dt.weekday // 1=Mon … 7=Sun
  const hour = dt.hour + dt.minute / 60
  return weekday >= 1 && weekday <= 4 && hour >= 11 && hour < 16
}

// Credits in 15-min buckets with the guest peak multiplier
function computeCredits(startIso: string, endIso: string, peakMultiplier: number) {
  const start = DateTime.fromISO(startIso, { zone: TZ })
  const end = DateTime.fromISO(endIso, { zone: TZ })
  if (!start.isValid || !end.isValid) throw new Error('Invalid datetime')
  if (!(start < end)) throw new Error('Invalid time range')

  const stepMinutes = 15
  let cursor = start
  let credits = 0

  while (cursor < end) {
    const next = cursor.plus({ minutes: stepMinutes })
    const bucketEnd = next < end ? next : end
    const minutes = bucketEnd.diff(cursor, 'minutes').minutes
    const rate = isPeak(cursor) ? peakMultiplier : 1.0
    credits += (minutes / 60) * rate
    cursor = bucketEnd
  }

  return Math.round(credits * 100) / 100
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const body = bodySchema.parse(await readBody(event))

  const start = DateTime.fromISO(body.start_time, { zone: TZ })
  const end = DateTime.fromISO(body.end_time, { zone: TZ })

  if (!start.isValid || !end.isValid) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid datetime' })
  }
  if (!(start < end)) {
    throw createError({ statusCode: 400, statusMessage: 'End must be after start' })
  }

  // Minimum booking: 1 hour
  const durationHours = end.diff(start, 'hours').hours
  if (durationHours < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Minimum booking is 1 hour' })
  }

  // Don't allow bookings in the past
  const now = DateTime.now().setZone(TZ)
  if (start < now) {
    throw createError({ statusCode: 400, statusMessage: 'Cannot book in the past' })
  }

  // Guest booking window: max 7 days ahead (keeps calendar manageable)
  const maxAhead = now.plus({ days: 7 })
  if (start > maxAhead) {
    throw createError({ statusCode: 400, statusMessage: 'Guest bookings can only be made up to 7 days ahead' })
  }

  // Check for conflicts (confirmed bookings or holds overlapping requested window)
  const { data: conflicts, error: conflictErr } = await supabase
    .from('bookings')
    .select('id')
    .in('status', ['confirmed', 'requested', 'pending_payment'])
    .lt('start_time', end.toUTC().toISO())
    .gt('end_time', start.toUTC().toISO())
    .limit(1)

  if (conflictErr) throw createError({ statusCode: 500, statusMessage: conflictErr.message })
  if (conflicts && conflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'That time slot is not available' })
  }

  // Also check holds
  const { data: holdConflicts, error: holdErr } = await supabase
    .from('booking_holds')
    .select('id')
    .lt('hold_start', end.toUTC().toISO())
    .gt('hold_end', start.toUTC().toISO())
    .limit(1)

  if (holdErr) throw createError({ statusCode: 500, statusMessage: holdErr.message })
  if (holdConflicts && holdConflicts.length > 0) {
    throw createError({ statusCode: 409, statusMessage: 'That time slot is not available (hold conflict)' })
  }

  // Pull guest rate config from system_config (falls back to sensible defaults)
  const cfg = await getServerConfigMap(event, [
    'guest_booking_rate_per_credit_cents',
    'guest_peak_multiplier'
  ])
  const ratePerCreditCents = Number(cfg.guest_booking_rate_per_credit_cents ?? 3500) // $35/credit default
  const peakMultiplier = Number(cfg.guest_peak_multiplier ?? 2.0)

  const creditsNeeded = computeCredits(body.start_time, body.end_time, peakMultiplier)
  const totalCents = Math.ceil(creditsNeeded * ratePerCreditCents)
  const totalDollars = totalCents / 100

  // Create or find Square customer for this guest
  const square = await useSquareClient(event)
  const locationId = process.env.SQUARE_LOCATION_ID || ''
  const baseUrl = process.env.APP_BASE_URL || ''

  // Insert pending booking with guest info in dedicated columns
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      start_time: start.toUTC().toISO()!,
      end_time: end.toUTC().toISO()!,
      status: 'pending_payment',
      notes: body.notes ?? null,
      credits_burned: creditsNeeded,
      guest_name: body.guest_name,
      guest_email: body.guest_email
    })
    .select('id')
    .single()

  if (bookingErr || !booking) {
    throw createError({ statusCode: 500, statusMessage: bookingErr?.message ?? 'Failed to create pending booking' })
  }

  const idempotencyKey = randomUUID()
  const durationLabel = durationHours === Math.floor(durationHours)
    ? `${durationHours}h`
    : `${durationHours.toFixed(1)}h`

  const startLabel = start.toFormat('EEE MMM d h:mm a')

  // Create one-time Square payment link
  const createRes = await (square as any).checkout.createPaymentLink({
    idempotencyKey,
    quickPay: {
      name: `Studio Booking — ${startLabel} (${durationLabel})`,
      priceMoney: {
        amount: BigInt(totalCents),
        currency: 'USD'
      },
      locationId
    },
    checkoutOptions: {
      redirectUrl: `${baseUrl}/checkout/booking-success?booking_id=${booking.id}`
    },
    order: {
      locationId,
      referenceId: booking.id,
      metadata: {
        booking_id: booking.id,
        booking_type: 'guest',
        guest_name: body.guest_name,
        guest_email: body.guest_email,
        start_time: body.start_time,
        end_time: body.end_time,
        credits_needed: String(creditsNeeded)
      },
      buyerEmailAddress: body.guest_email
    }
  })

  const paymentLink = (createRes as any)?.paymentLink
  if (!paymentLink?.url) {
    // Clean up the pending booking if Square fails
    await supabase.from('bookings').delete().eq('id', booking.id)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create payment link' })
  }

  // Store Square order reference on the booking for webhook matching
  await supabase
    .from('bookings')
    .update({ square_order_id: paymentLink.orderId ?? null })
    .eq('id', booking.id)

  return {
    ok: true,
    bookingId: booking.id,
    creditsNeeded,
    totalCents,
    totalDollars,
    checkoutUrl: paymentLink.url,
    summary: {
      start: start.toISO(),
      end: end.toISO(),
      durationHours,
      guestName: body.guest_name
    }
  }
})
