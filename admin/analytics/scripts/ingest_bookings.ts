import { DateTime } from 'luxon'
import {
  RAW_BOOKINGS_PATH,
  RAW_REVENUE_PATH
} from './lib/constants'
import { toDateDims } from './lib/dates'
import { writeJsonFile } from './lib/fs'
import { toStringOrNull } from './lib/parse'
import { createSupabaseClient } from './lib/supabase'
import type { IngestManifest, IngestSource, RawBookingRecord, RawRevenueEventRecord } from './lib/types'
import {
  buildCustomerLookup,
  fetchCustomerClassificationRows,
  resolveAccountClassification
} from './lib/accountFlags'
import {
  resolveMembershipCheckoutRevenue,
  type MembershipCheckoutRevenueSession,
  type MembershipVariationPriceRow
} from '../../../server/utils/revenue/membershipCheckout'

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
}

type MembershipSessionRow = {
  id: string
  paid_at: string | null
  plan_variation_id: string | null
  tier: string | null
  cadence: string | null
  claimed_by_user_id: string | null
  customer_id: string | null
  claimed_membership_id: string | null
  status: string | null
  metadata: Record<string, unknown> | null
}

type TopupRow = {
  paid_at: string | null
  user_id: string | null
  amount_cents: number | null
}

function hoursBetween(startIso: string, endIso: string) {
  const start = DateTime.fromISO(startIso)
  const end = DateTime.fromISO(endIso)
  if (!start.isValid || !end.isValid || end <= start) return 0
  return Number(end.diff(start, 'hours').hours.toFixed(2))
}

async function loadFromSupabase() {
  const supabase = createSupabaseClient()
  if (!supabase) {
    return {
      source: 'unavailable' as IngestSource,
      bookings: [] as RawBookingRecord[],
      revenue: [] as RawRevenueEventRecord[],
      notes: ['Supabase credentials were not found. Booking and revenue data are unavailable.']
    }
  }

  const [
    bookingsRes,
    ordersRes,
    sessionsRes,
    variationsRes,
    creditTopupRes,
    holdTopupRes,
    customerRows
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('id,user_id,customer_id,guest_email,start_time,end_time,status,square_order_id')
      .limit(10000),
    supabase
      .from('orders2')
      .select('orderId,total,state')
      .limit(10000),
    supabase
      .from('membership_checkout_sessions')
      .select('id,paid_at,plan_variation_id,tier,cadence,claimed_by_user_id,customer_id,claimed_membership_id,status,metadata')
      .not('paid_at', 'is', null)
      .limit(8000),
    supabase
      .from('membership_plan_variations')
      .select('id,tier_id,cadence,provider_plan_variation_id,price_cents')
      .limit(200),
    supabase
      .from('credit_topup_sessions')
      .select('paid_at,user_id,amount_cents')
      .eq('status', 'processed')
      .not('paid_at', 'is', null)
      .limit(10000),
    supabase
      .from('hold_topup_sessions')
      .select('paid_at,user_id,amount_cents')
      .eq('status', 'processed')
      .not('paid_at', 'is', null)
      .limit(10000),
    fetchCustomerClassificationRows(supabase).catch(() => [])
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
      source: 'unavailable' as IngestSource,
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

  const customerLookup = buildCustomerLookup(customerRows)

  const bookings = ((bookingsRes.data ?? []) as BookingRow[])
    .map((booking) => {
      const userId = toStringOrNull(booking.user_id)
      const bookingType: RawBookingRecord['booking_type'] = userId ? 'member' : 'guest'
      const revenue = bookingType === 'guest'
        ? Math.max(0, Number(ordersBySquareId.get(String(booking.square_order_id ?? '').trim()) ?? 0))
        : 0
      const account = resolveAccountClassification({
        customerId: booking.customer_id,
        userId: booking.user_id,
        email: booking.guest_email
      }, customerLookup)

      return {
        booking_id: String(booking.id),
        customer_id: String(booking.customer_id ?? booking.user_id ?? booking.guest_email ?? booking.id),
        user_id: userId,
        guest_email: toStringOrNull(booking.guest_email),
        start_time: String(booking.start_time),
        end_time: String(booking.end_time),
        status: String(booking.status ?? '').trim().toLowerCase() || 'confirmed',
        hours: hoursBetween(String(booking.start_time), String(booking.end_time)),
        revenue,
        booking_type: bookingType,
        channel: 'website',
        is_test_account: account.is_test_account,
        is_internal_account: account.is_internal_account,
        exclude_from_kpis: account.exclude_from_kpis,
        expires_at: account.expires_at
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
      account_email: booking.guest_email,
      source: 'guest_booking',
      amount: booking.revenue,
      order_id: null,
      tier: null,
      cadence: null,
      is_test_account: booking.is_test_account,
      is_internal_account: booking.is_internal_account,
      exclude_from_kpis: booking.exclude_from_kpis,
      expires_at: booking.expires_at
    })
  }

  const membershipRevenue = resolveMembershipCheckoutRevenue(
    ((sessionsRes.data ?? []) as MembershipSessionRow[]).map((row): MembershipCheckoutRevenueSession => ({
      id: String(row.id),
      paid_at: row.paid_at,
      plan_variation_id: row.plan_variation_id,
      tier: row.tier,
      cadence: row.cadence,
      claimed_by_user_id: row.claimed_by_user_id,
      customer_id: row.customer_id,
      claimed_membership_id: row.claimed_membership_id,
      status: row.status,
      metadata: row.metadata
    })),
    (variationsRes.data ?? []) as MembershipVariationPriceRow[],
    { dedupeWindowHours: 36 }
  )

  for (const row of membershipRevenue.rows) {
    const amount = Number((row.amountCents / 100).toFixed(2))
    if (amount <= 0) continue
    const account = resolveAccountClassification({
      customerId: row.customerId,
      userId: row.userId
    }, customerLookup)

    revenue.push({
      date: String(row.paidAt),
      user_id: toStringOrNull(row.userId),
      customer_id: toStringOrNull(row.customerId),
      account_email: account.account_email,
      source: 'membership',
      amount,
      order_id: row.sessionId || null,
      tier: row.tier,
      cadence: row.cadence,
      is_test_account: account.is_test_account,
      is_internal_account: account.is_internal_account,
      exclude_from_kpis: account.exclude_from_kpis,
      expires_at: account.expires_at
    })
  }

  for (const row of ((creditTopupRes.data ?? []) as TopupRow[])) {
    const amount = Math.max(0, Number(row.amount_cents ?? 0) / 100)
    if (!row.paid_at || amount <= 0) continue
    const account = resolveAccountClassification({
      userId: row.user_id
    }, customerLookup)
    revenue.push({
      date: String(row.paid_at),
      user_id: toStringOrNull(row.user_id),
      customer_id: null,
      account_email: account.account_email,
      source: 'credit_topup',
      amount,
      order_id: null,
      tier: null,
      cadence: null,
      is_test_account: account.is_test_account,
      is_internal_account: account.is_internal_account,
      exclude_from_kpis: account.exclude_from_kpis,
      expires_at: account.expires_at
    })
  }

  for (const row of ((holdTopupRes.data ?? []) as TopupRow[])) {
    const amount = Math.max(0, Number(row.amount_cents ?? 0) / 100)
    if (!row.paid_at || amount <= 0) continue
    const account = resolveAccountClassification({
      userId: row.user_id
    }, customerLookup)
    revenue.push({
      date: String(row.paid_at),
      user_id: toStringOrNull(row.user_id),
      customer_id: null,
      account_email: account.account_email,
      source: 'hold_topup',
      amount,
      order_id: null,
      tier: null,
      cadence: null,
      is_test_account: account.is_test_account,
      is_internal_account: account.is_internal_account,
      exclude_from_kpis: account.exclude_from_kpis,
      expires_at: account.expires_at
    })
  }

  const excludedBookings = bookings.filter(row => row.exclude_from_kpis).length
  const excludedRevenue = revenue.filter(row => row.exclude_from_kpis).length

  return {
    source: 'supabase' as IngestSource,
    bookings,
    revenue,
    notes: [
      `Loaded ${bookings.length} booking rows from Supabase.`,
      `Loaded ${revenue.length} revenue events from Supabase.`,
      `Loaded ${customerRows.length} customer classification rows from Supabase.`,
      `Excluded ${excludedBookings} bookings and ${excludedRevenue} revenue events from KPI computations due to account classification.`,
      `Membership revenue sessions included: ${membershipRevenue.stats.includedSessions} / ${membershipRevenue.stats.inputSessions}.`,
      `Membership session drops: status=${membershipRevenue.stats.droppedByStatus}, metadata_exclude=${membershipRevenue.stats.droppedByMetadataExclude}, dedupe=${membershipRevenue.stats.droppedByDeduplication}, missing_amount=${membershipRevenue.stats.droppedByMissingAmount}.`
    ]
  }
}

async function run() {
  const result = await loadFromSupabase()

  const manifest: IngestManifest = {
    generated_at: new Date().toISOString(),
    source: result.source,
    notes: result.notes
  }

  await Promise.all([
    writeJsonFile(RAW_BOOKINGS_PATH, { manifest, records: result.bookings }),
    writeJsonFile(RAW_REVENUE_PATH, { manifest, records: result.revenue })
  ])

  console.log(`[analytics] bookings ingest complete: ${result.bookings.length} bookings, ${result.revenue.length} revenue events (${result.source})`)
}

run().catch((error: unknown) => {
  console.error('[analytics] bookings ingest failed', error)
  process.exitCode = 1
})
