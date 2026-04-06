import { DateTime } from 'luxon'
import {
  INPUT_BOOKINGS_CSV_PATH,
  INPUT_REVENUE_CSV_PATH,
  RAW_BOOKINGS_PATH,
  RAW_REVENUE_PATH
} from './lib/constants'
import { readCsv } from './lib/csv'
import { toDateDims } from './lib/dates'
import { writeJsonFile } from './lib/fs'
import { toNumber, toStringOrNull } from './lib/parse'
import { createSupabaseClient } from './lib/supabase'
import type { IngestManifest, RawBookingRecord, RawRevenueEventRecord } from './lib/types'

type BookingRow = {
  id: string
  user_id: string | null
  customer_id: string | null
  guest_email: string | null
  start_time: string
  end_time: string
  status: string
  square_order_id: string | null
}

type OrderRow = {
  orderId: string | null
  total: number | null
  state: string | null
  created: string | null
  user_id: string | null
  email: string | null
}

type VariationRow = {
  id: string
  tier_id: string
  cadence: string | null
  price_cents: number
}

type MembershipSessionRow = {
  paid_at: string | null
  plan_variation_id: string | null
  tier: string | null
  cadence: string | null
  claimed_by_user_id: string | null
  customer_id: string | null
  status: string
}

type TopupRow = {
  paid_at: string | null
  user_id: string | null
  amount_cents: number | null
  status: string
}

function hoursBetween(startIso: string, endIso: string) {
  const start = DateTime.fromISO(startIso)
  const end = DateTime.fromISO(endIso)
  if (!start.isValid || !end.isValid || end <= start) return 0
  return Number(end.diff(start, 'hours').hours.toFixed(2))
}

function normalizeBookingFromCsv(row: Record<string, string>, idx: number): RawBookingRecord {
  const start = String(row.start_time || row.date || new Date().toISOString())
  const end = String(row.end_time || start)
  const hours = toNumber(row.hours, hoursBetween(start, end))

  return {
    booking_id: String(row.booking_id || `csv-booking-${idx + 1}`).trim(),
    customer_id: String(row.customer_id || row.user_id || `csv-customer-${idx + 1}`).trim(),
    user_id: toStringOrNull(row.user_id),
    start_time: start,
    end_time: end,
    status: String(row.status || 'confirmed').trim().toLowerCase(),
    hours,
    revenue: toNumber(row.revenue, 0),
    booking_type: (String(row.booking_type || (row.user_id ? 'member' : 'guest')).trim().toLowerCase() as RawBookingRecord['booking_type']),
    channel: String(row.channel || 'website').trim().toLowerCase()
  }
}

function normalizeRevenueFromCsv(row: Record<string, string>): RawRevenueEventRecord {
  const date = String(row.date || row.paid_at || new Date().toISOString())
  return {
    date,
    user_id: toStringOrNull(row.user_id),
    customer_id: toStringOrNull(row.customer_id),
    source: (String(row.source || 'other').trim().toLowerCase() as RawRevenueEventRecord['source']),
    amount: toNumber(row.amount, 0),
    order_id: toStringOrNull(row.order_id),
    tier: toStringOrNull(row.tier),
    cadence: toStringOrNull(row.cadence)
  }
}

function toPricingMap(rows: VariationRow[]) {
  const byVariation = new Map<string, { amount: number, tier: string, cadence: string | null }>()
  const byTierCadence = new Map<string, { amount: number, tier: string, cadence: string | null }>()

  for (const row of rows) {
    const amount = Math.max(0, Number(row.price_cents ?? 0) / 100)
    byVariation.set(String(row.id), {
      amount,
      tier: String(row.tier_id ?? '').trim().toLowerCase() || 'other',
      cadence: toStringOrNull(row.cadence)?.toLowerCase() ?? null
    })

    const tier = String(row.tier_id ?? '').trim().toLowerCase() || 'other'
    const cadence = toStringOrNull(row.cadence)?.toLowerCase() ?? ''
    const key = `${tier}:${cadence}`
    if (!byTierCadence.has(key)) {
      byTierCadence.set(key, {
        amount,
        tier,
        cadence: cadence || null
      })
    }
  }

  return { byVariation, byTierCadence }
}

async function loadFromSupabase() {
  const supabase = createSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      bookings: [] as RawBookingRecord[],
      revenue: [] as RawRevenueEventRecord[],
      notes: ['Supabase credentials were not found; CSV fallback will be used.']
    }
  }

  const [
    bookingsRes,
    ordersRes,
    sessionsRes,
    variationsRes,
    creditTopupRes,
    holdTopupRes
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('id,user_id,customer_id,guest_email,start_time,end_time,status,square_order_id')
      .limit(10000),
    supabase
      .from('orders2')
      .select('orderId,total,state,created,user_id,email')
      .limit(10000),
    supabase
      .from('membership_checkout_sessions')
      .select('paid_at,plan_variation_id,tier,cadence,claimed_by_user_id,customer_id,status')
      .not('paid_at', 'is', null)
      .limit(8000),
    supabase
      .from('membership_plan_variations')
      .select('id,tier_id,cadence,price_cents')
      .limit(200),
    supabase
      .from('credit_topup_sessions')
      .select('paid_at,user_id,amount_cents,status')
      .eq('status', 'processed')
      .not('paid_at', 'is', null)
      .limit(10000),
    supabase
      .from('hold_topup_sessions')
      .select('paid_at,user_id,amount_cents,status')
      .eq('status', 'processed')
      .not('paid_at', 'is', null)
      .limit(10000)
  ])

  const failed = [
    bookingsRes.error,
    ordersRes.error,
    sessionsRes.error,
    variationsRes.error,
    creditTopupRes.error,
    holdTopupRes.error
  ].filter(Boolean)

  if (failed.length) {
    return {
      ok: false,
      bookings: [] as RawBookingRecord[],
      revenue: [] as RawRevenueEventRecord[],
      notes: [`Supabase bookings/revenue query failed: ${failed[0]?.message ?? 'unknown error'}`]
    }
  }

  const ordersBySquareId = new Map<string, number>()
  for (const order of ((ordersRes.data ?? []) as OrderRow[])) {
    const key = String(order.orderId ?? '').trim()
    if (!key) continue
    if ((order.state ?? '').toLowerCase() === 'canceled') continue
    ordersBySquareId.set(key, Math.max(0, Number(order.total ?? 0)))
  }

  const bookings = ((bookingsRes.data ?? []) as BookingRow[])
    .map((booking) => {
      const userId = toStringOrNull(booking.user_id)
      const bookingType: RawBookingRecord['booking_type'] = userId ? 'member' : 'guest'
      const revenue = bookingType === 'guest'
        ? Math.max(0, Number(ordersBySquareId.get(String(booking.square_order_id ?? '').trim()) ?? 0))
        : 0

      return {
        booking_id: String(booking.id),
        customer_id: String(booking.customer_id ?? booking.user_id ?? booking.guest_email ?? booking.id),
        user_id: userId,
        start_time: String(booking.start_time),
        end_time: String(booking.end_time),
        status: String(booking.status ?? '').trim().toLowerCase() || 'confirmed',
        hours: hoursBetween(String(booking.start_time), String(booking.end_time)),
        revenue,
        booking_type: bookingType,
        channel: 'website'
      }
    })

  const revenue: RawRevenueEventRecord[] = []

  for (const booking of bookings) {
    if (booking.revenue <= 0) continue
    const dims = toDateDims(booking.start_time)
    revenue.push({
      date: dims.date,
      user_id: booking.user_id,
      customer_id: booking.customer_id,
      source: 'guest_booking',
      amount: booking.revenue,
      order_id: null,
      tier: null,
      cadence: null
    })
  }

  const pricing = toPricingMap((variationsRes.data ?? []) as VariationRow[])

  for (const row of ((sessionsRes.data ?? []) as MembershipSessionRow[])) {
    if (!row.paid_at) continue

    const byVariation = row.plan_variation_id
      ? pricing.byVariation.get(String(row.plan_variation_id))
      : null

    const tier = String(row.tier ?? '').trim().toLowerCase() || 'other'
    const cadence = toStringOrNull(row.cadence)?.toLowerCase() ?? null
    const byPair = pricing.byTierCadence.get(`${tier}:${cadence ?? ''}`)
    const amount = byVariation?.amount ?? byPair?.amount ?? 0

    if (amount <= 0) continue

    revenue.push({
      date: String(row.paid_at),
      user_id: toStringOrNull(row.claimed_by_user_id),
      customer_id: toStringOrNull(row.customer_id),
      source: 'membership',
      amount,
      order_id: null,
      tier: tier || null,
      cadence
    })
  }

  for (const row of ((creditTopupRes.data ?? []) as TopupRow[])) {
    const amount = Math.max(0, Number(row.amount_cents ?? 0) / 100)
    if (!row.paid_at || amount <= 0) continue
    revenue.push({
      date: String(row.paid_at),
      user_id: toStringOrNull(row.user_id),
      customer_id: null,
      source: 'credit_topup',
      amount,
      order_id: null,
      tier: null,
      cadence: null
    })
  }

  for (const row of ((holdTopupRes.data ?? []) as TopupRow[])) {
    const amount = Math.max(0, Number(row.amount_cents ?? 0) / 100)
    if (!row.paid_at || amount <= 0) continue
    revenue.push({
      date: String(row.paid_at),
      user_id: toStringOrNull(row.user_id),
      customer_id: null,
      source: 'hold_topup',
      amount,
      order_id: null,
      tier: null,
      cadence: null
    })
  }

  return {
    ok: true,
    bookings,
    revenue,
    notes: [
      `Loaded ${bookings.length} booking rows from Supabase.`,
      `Loaded ${revenue.length} revenue events from Supabase.`
    ]
  }
}

async function loadFromCsv() {
  const [bookingRows, revenueRows] = await Promise.all([
    readCsv(INPUT_BOOKINGS_CSV_PATH),
    readCsv(INPUT_REVENUE_CSV_PATH)
  ])

  const bookings = bookingRows.map((row, idx) => normalizeBookingFromCsv(row, idx))
  const revenue = revenueRows.map(row => normalizeRevenueFromCsv(row))

  return {
    bookings,
    revenue,
    notes: [
      `Loaded ${bookings.length} booking rows from CSV (${INPUT_BOOKINGS_CSV_PATH}).`,
      `Loaded ${revenue.length} revenue rows from CSV (${INPUT_REVENUE_CSV_PATH}).`
    ]
  }
}

async function run() {
  const requireSupabase = process.env.ANALYTICS_REQUIRE_SUPABASE === '1'
    || process.argv.includes('--require-supabase')

  const supabaseResult = await loadFromSupabase()
  const useCsvFallback = !supabaseResult.ok
  if (requireSupabase && useCsvFallback) {
    throw new Error(`[analytics] Supabase required for bookings ingest but unavailable. ${supabaseResult.notes.join(' ')}`)
  }

  const csvResult = useCsvFallback
    ? await loadFromCsv()
    : { bookings: [] as RawBookingRecord[], revenue: [] as RawRevenueEventRecord[], notes: [] as string[] }

  const source = useCsvFallback ? 'csv' : 'supabase'
  const bookings = useCsvFallback ? csvResult.bookings : supabaseResult.bookings
  const revenue = useCsvFallback ? csvResult.revenue : supabaseResult.revenue

  const manifest: IngestManifest = {
    generated_at: new Date().toISOString(),
    source,
    notes: [...supabaseResult.notes, ...csvResult.notes]
  }

  await Promise.all([
    writeJsonFile(RAW_BOOKINGS_PATH, { manifest, records: bookings }),
    writeJsonFile(RAW_REVENUE_PATH, { manifest, records: revenue })
  ])

  console.log(`[analytics] bookings ingest complete: ${bookings.length} bookings, ${revenue.length} revenue events (${source})`)
}

run().catch((error: unknown) => {
  console.error('[analytics] bookings ingest failed', error)
  process.exitCode = 1
})
