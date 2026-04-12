import {
  NORMALIZED_OPS_PATH,
  NORMALIZED_ADS_PATH,
  NORMALIZED_BOOKINGS_PATH,
  NORMALIZED_MEMBERSHIPS_PATH,
  NORMALIZED_MEMBERSHIP_STATE_PATH,
  NORMALIZED_REVENUE_PATH,
  RAW_OPS_PATH,
  RAW_ADS_PATH,
  RAW_BOOKINGS_PATH,
  RAW_MEMBERSHIPS_PATH,
  RAW_REVENUE_PATH
} from './lib/constants'
import { toDateDims } from './lib/dates'
import { readJsonFile, writeJsonFile } from './lib/fs'
import { toStringOrNull } from './lib/parse'
import type {
  MembershipStateRecord,
  NormalizedExpenseRecord,
  NormalizedIncidentRecord,
  NormalizedAdRecord,
  NormalizedBookingRecord,
  NormalizedMembershipRecord,
  NormalizedRevenueEventRecord,
  RawExpenseRecord,
  RawIncidentRecord,
  RawAdRecord,
  RawBookingRecord,
  RawMembershipRecord,
  RawRevenueEventRecord,
  TierKey
} from './lib/types'

function normalizeTier(value: string | null | undefined): TierKey {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'creator') return 'creator'
  if (normalized === 'pro') return 'pro'
  if (normalized === 'studio_plus' || normalized === 'studio+' || normalized === 'studio plus') return 'studio_plus'
  return 'other'
}

function toMembershipEvents(rows: RawMembershipRecord[]): NormalizedMembershipRecord[] {
  const events: NormalizedMembershipRecord[] = []

  for (const row of rows) {
    const customerId = String(row.customer_id ?? row.user_id).trim()
    if (!customerId) continue

    const tier = normalizeTier(row.tier)
    const status = String(row.status ?? '').trim().toLowerCase() || 'active'

    const createdDims = toDateDims(row.created_at)
    events.push({
      ...createdDims,
      customer_id: customerId,
      user_id: toStringOrNull(row.user_id),
      membership_id: row.membership_id,
      account_email: toStringOrNull(row.account_email),
      tier,
      status,
      amount: Number(row.amount ?? 0),
      is_new: true,
      is_canceled: false,
      is_test_account: Boolean(row.is_test_account),
      is_internal_account: Boolean(row.is_internal_account),
      exclude_from_kpis: Boolean(row.exclude_from_kpis),
      expires_at: toStringOrNull(row.expires_at)
    })

    if (row.canceled_at) {
      const canceledDims = toDateDims(row.canceled_at)
      events.push({
        ...canceledDims,
        customer_id: customerId,
        user_id: toStringOrNull(row.user_id),
        membership_id: row.membership_id,
        account_email: toStringOrNull(row.account_email),
        tier,
        status: 'canceled',
        amount: 0,
        is_new: false,
        is_canceled: true,
        is_test_account: Boolean(row.is_test_account),
        is_internal_account: Boolean(row.is_internal_account),
        exclude_from_kpis: Boolean(row.exclude_from_kpis),
        expires_at: toStringOrNull(row.expires_at)
      })
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date))
}

function toMembershipState(rows: RawMembershipRecord[]): MembershipStateRecord[] {
  return rows.map(row => ({
    membership_id: row.membership_id,
    user_id: row.user_id,
    customer_id: String(row.customer_id ?? row.user_id),
    account_email: toStringOrNull(row.account_email),
    tier: normalizeTier(row.tier),
    cadence: row.cadence,
    status: String(row.status ?? '').trim().toLowerCase(),
    amount: Number(row.amount ?? 0),
    created_at: row.created_at,
    canceled_at: row.canceled_at,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    last_paid_at: row.last_paid_at,
    is_test_account: Boolean(row.is_test_account),
    is_internal_account: Boolean(row.is_internal_account),
    exclude_from_kpis: Boolean(row.exclude_from_kpis),
    expires_at: toStringOrNull(row.expires_at)
  }))
}

function toNormalizedBookings(rows: RawBookingRecord[]): NormalizedBookingRecord[] {
  return rows
    .map(row => ({
      ...toDateDims(row.start_time),
      booking_id: String(row.booking_id),
      customer_id: String(row.customer_id),
      user_id: toStringOrNull(row.user_id),
      guest_email: toStringOrNull(row.guest_email),
      hours: Number(row.hours ?? 0),
      revenue: Number(row.revenue ?? 0),
      booking_type: String(row.booking_type ?? 'other').toLowerCase(),
      channel: String(row.channel ?? 'website').toLowerCase(),
      status: String(row.status ?? 'confirmed').toLowerCase(),
      is_test_account: Boolean(row.is_test_account),
      is_internal_account: Boolean(row.is_internal_account),
      exclude_from_kpis: Boolean(row.exclude_from_kpis),
      expires_at: toStringOrNull(row.expires_at)
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function toNormalizedRevenue(rows: RawRevenueEventRecord[]): NormalizedRevenueEventRecord[] {
  return rows
    .map(row => ({
      ...toDateDims(row.date),
      user_id: toStringOrNull(row.user_id),
      customer_id: toStringOrNull(row.customer_id),
      account_email: toStringOrNull(row.account_email),
      source: String(row.source ?? 'other').toLowerCase(),
      amount: Number(row.amount ?? 0),
      order_id: toStringOrNull(row.order_id),
      tier: row.tier ? normalizeTier(row.tier) : null,
      cadence: toStringOrNull(row.cadence),
      is_test_account: Boolean(row.is_test_account),
      is_internal_account: Boolean(row.is_internal_account),
      exclude_from_kpis: Boolean(row.exclude_from_kpis),
      expires_at: toStringOrNull(row.expires_at)
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function toNormalizedAds(rows: RawAdRecord[]): NormalizedAdRecord[] {
  return rows
    .map(row => ({
      ...toDateDims(row.date),
      platform: row.platform,
      campaign: String(row.campaign ?? 'unknown-campaign'),
      spend: Number(row.spend ?? 0),
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      conversions: Number(row.conversions ?? 0)
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function toNormalizedIncidents(rows: RawIncidentRecord[]): NormalizedIncidentRecord[] {
  return rows
    .map((row) => {
      const anchor = row.occurred_at ?? row.updated_at ?? row.created_at
      return {
        ...toDateDims(anchor || row.created_at),
        incident_id: String(row.incident_id),
        title: String(row.title ?? ''),
        category: String(row.category ?? 'other'),
        severity: row.severity,
        status: row.status,
        member_user_id: toStringOrNull(row.member_user_id),
        occurred_at: toStringOrNull(row.occurred_at),
        resolved_at: toStringOrNull(row.resolved_at),
        closed_at: toStringOrNull(row.closed_at),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at)
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

function toNormalizedExpenses(rows: RawExpenseRecord[]): NormalizedExpenseRecord[] {
  return rows
    .map((row) => {
      const anchor = row.incurred_on ?? row.updated_at ?? row.created_at
      return {
        ...toDateDims(anchor || row.created_at),
        expense_id: String(row.expense_id),
        title: String(row.title ?? ''),
        category: String(row.category ?? 'other'),
        status: row.status,
        amount_cents: Math.max(0, Number(row.amount_cents ?? 0)),
        amount: Math.max(0, Number(row.amount_cents ?? 0) / 100),
        currency: String(row.currency ?? 'USD'),
        incident_id: toStringOrNull(row.incident_id),
        member_user_id: toStringOrNull(row.member_user_id),
        incurred_on: toStringOrNull(row.incurred_on),
        submitted_at: toStringOrNull(row.submitted_at),
        approved_at: toStringOrNull(row.approved_at),
        paid_at: toStringOrNull(row.paid_at),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at)
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

async function run() {
  const [membershipsRaw, bookingsRaw, revenueRaw, opsRaw, adsRaw] = await Promise.all([
    readJsonFile<{ records: RawMembershipRecord[] }>(RAW_MEMBERSHIPS_PATH),
    readJsonFile<{ records: RawBookingRecord[] }>(RAW_BOOKINGS_PATH),
    readJsonFile<{ records: RawRevenueEventRecord[] }>(RAW_REVENUE_PATH),
    readJsonFile<{ incidents: RawIncidentRecord[], expenses: RawExpenseRecord[] }>(RAW_OPS_PATH),
    readJsonFile<{ records: RawAdRecord[] }>(RAW_ADS_PATH)
  ])

  const membershipsRecords = membershipsRaw?.records ?? []
  const bookingRecords = bookingsRaw?.records ?? []
  const revenueRecords = revenueRaw?.records ?? []
  const incidentRecords = opsRaw?.incidents ?? []
  const expenseRecords = opsRaw?.expenses ?? []
  const adRecords = adsRaw?.records ?? []

  const normalizedMemberships = toMembershipEvents(membershipsRecords)
  const membershipState = toMembershipState(membershipsRecords)
  const normalizedBookings = toNormalizedBookings(bookingRecords)
  const normalizedRevenue = toNormalizedRevenue(revenueRecords)
  const normalizedIncidents = toNormalizedIncidents(incidentRecords)
  const normalizedExpenses = toNormalizedExpenses(expenseRecords)
  const normalizedAds = toNormalizedAds(adRecords)

  await Promise.all([
    writeJsonFile(NORMALIZED_MEMBERSHIPS_PATH, normalizedMemberships),
    writeJsonFile(NORMALIZED_MEMBERSHIP_STATE_PATH, membershipState),
    writeJsonFile(NORMALIZED_BOOKINGS_PATH, normalizedBookings),
    writeJsonFile(NORMALIZED_REVENUE_PATH, normalizedRevenue),
    writeJsonFile(NORMALIZED_OPS_PATH, {
      incidents: normalizedIncidents,
      expenses: normalizedExpenses
    }),
    writeJsonFile(NORMALIZED_ADS_PATH, normalizedAds)
  ])

  console.log(
    '[analytics] normalize complete:',
    `${normalizedMemberships.length} membership events,`,
    `${normalizedBookings.length} bookings,`,
    `${normalizedRevenue.length} revenue events,`,
    `${normalizedIncidents.length} incidents,`,
    `${normalizedExpenses.length} expenses,`,
    `${normalizedAds.length} ad rows`
  )
}

run().catch((error: unknown) => {
  console.error('[analytics] normalize failed', error)
  process.exitCode = 1
})
