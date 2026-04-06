import { DateTime } from 'luxon'
import { analyticsMetricDefinitions } from '../../config/metric-definitions'
import {
  NORMALIZED_ADS_PATH,
  NORMALIZED_BOOKINGS_PATH,
  NORMALIZED_MEMBERSHIPS_PATH,
  NORMALIZED_MEMBERSHIP_STATE_PATH,
  NORMALIZED_REVENUE_PATH
} from './constants'
import { weekRangeFromWeekOf } from './dates'
import { readJsonFile } from './fs'
import type {
  MembershipStateRecord,
  NormalizedAdRecord,
  NormalizedBookingRecord,
  NormalizedMembershipRecord,
  NormalizedRevenueEventRecord,
  TierKey
} from './types'

export type AnalyticsDataSet = {
  memberships: NormalizedMembershipRecord[]
  membershipState: MembershipStateRecord[]
  bookings: NormalizedBookingRecord[]
  revenue: NormalizedRevenueEventRecord[]
  ads: NormalizedAdRecord[]
}

export function parseWeekOfArg() {
  const match = process.argv
    .slice(2)
    .find(arg => arg.startsWith('--week-of='))

  if (!match) return undefined
  return match.split('=')[1]
}

export function safePercentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0
  if (previous === 0) return current === 0 ? 0 : 100
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2))
}

function toDateInZone(value: string, zone = analyticsMetricDefinitions.timezone) {
  const parsed = DateTime.fromISO(value, { zone })
  if (parsed.isValid) return parsed
  const utcParsed = DateTime.fromISO(value, { zone: 'utc' })
  return utcParsed.isValid ? utcParsed.setZone(zone) : null
}

function isWithin(dateValue: string, start: DateTime, end: DateTime) {
  const parsed = toDateInZone(dateValue)
  if (!parsed) return false
  return parsed >= start && parsed <= end
}

export async function loadAnalyticsData(): Promise<AnalyticsDataSet> {
  const [memberships, membershipState, bookings, revenue, ads] = await Promise.all([
    readJsonFile<NormalizedMembershipRecord[]>(NORMALIZED_MEMBERSHIPS_PATH),
    readJsonFile<MembershipStateRecord[]>(NORMALIZED_MEMBERSHIP_STATE_PATH),
    readJsonFile<NormalizedBookingRecord[]>(NORMALIZED_BOOKINGS_PATH),
    readJsonFile<NormalizedRevenueEventRecord[]>(NORMALIZED_REVENUE_PATH),
    readJsonFile<NormalizedAdRecord[]>(NORMALIZED_ADS_PATH)
  ])

  return {
    memberships: memberships ?? [],
    membershipState: membershipState ?? [],
    bookings: bookings ?? [],
    revenue: revenue ?? [],
    ads: ads ?? []
  }
}

export function getWeekContext(weekOfInput?: string) {
  return weekRangeFromWeekOf(weekOfInput, analyticsMetricDefinitions.timezone)
}

export function sumRevenueInRange(rows: NormalizedRevenueEventRecord[], start: DateTime, end: DateTime) {
  return rows
    .filter(row => isWithin(row.date, start, end))
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
}

export function bookingsInRange(rows: NormalizedBookingRecord[], start: DateTime, end: DateTime) {
  return rows.filter(row => isWithin(row.date, start, end))
}

export function adsInRange(rows: NormalizedAdRecord[], start: DateTime, end: DateTime) {
  return rows.filter(row => isWithin(row.date, start, end))
}

function isActiveStatus(status: string) {
  const normalized = String(status ?? '').trim().toLowerCase()
  return normalized === 'active' || normalized === 'past_due'
}

export function activeMembershipStateAt(rows: MembershipStateRecord[], asOf: DateTime) {
  const asOfIso = asOf.toISO()
  if (!asOfIso) return []

  return rows.filter((row) => {
    const created = toDateInZone(row.created_at)
    if (!created || created > asOf) return false

    const canceled = row.canceled_at ? toDateInZone(row.canceled_at) : null
    if (canceled && canceled <= asOf) return false

    return isActiveStatus(row.status)
  })
}

export function membershipEventsInRange(rows: NormalizedMembershipRecord[], start: DateTime, end: DateTime) {
  return rows.filter(row => isWithin(row.date, start, end))
}

export function tierCountsFromState(rows: MembershipStateRecord[]) {
  const counts: Record<TierKey, number> = {
    creator: 0,
    pro: 0,
    studio_plus: 0,
    other: 0
  }

  for (const row of rows) {
    counts[row.tier] = (counts[row.tier] ?? 0) + 1
  }

  return counts
}

export function aggregateAds(rows: NormalizedAdRecord[]) {
  const base = {
    google: { spend: 0, conversions: 0, cost_per_conversion: 0 },
    meta: { spend: 0, conversions: 0, cost_per_conversion: 0 }
  }

  for (const row of rows) {
    if (row.platform !== 'google' && row.platform !== 'meta') continue
    base[row.platform].spend += Number(row.spend ?? 0)
    base[row.platform].conversions += Number(row.conversions ?? 0)
  }

  for (const platform of ['google', 'meta'] as const) {
    const target = base[platform]
    target.cost_per_conversion = target.conversions > 0
      ? Number((target.spend / target.conversions).toFixed(2))
      : 0
  }

  return base
}

export function toIsoWeekFromDate(date: DateTime) {
  const week = String(date.weekNumber).padStart(2, '0')
  return `${date.weekYear}-W${week}`
}

export function listRecentWeekStarts(referenceStart: DateTime, count: number) {
  const starts: DateTime[] = []
  for (let idx = count - 1; idx >= 0; idx -= 1) {
    starts.push(referenceStart.minus({ weeks: idx }).startOf('week'))
  }
  return starts
}

export function bookingsHours(rows: NormalizedBookingRecord[]) {
  return rows.reduce((sum, row) => sum + Number(row.hours ?? 0), 0)
}
