import { DateTime } from 'luxon'
import { analyticsMetricDefinitions } from '../../config/metric-definitions'
import {
  NORMALIZED_ADS_PATH,
  NORMALIZED_BOOKINGS_PATH,
  NORMALIZED_MEMBERSHIPS_PATH,
  NORMALIZED_MEMBERSHIP_STATE_PATH,
  NORMALIZED_REVENUE_PATH,
  RAW_ADS_PATH,
  RAW_BOOKINGS_PATH,
  RAW_MEMBERSHIPS_PATH,
  RAW_REVENUE_PATH
} from './constants'
import { weekRangeFromWeekOf } from './dates'
import { readJsonFile } from './fs'
import type {
  CohortMetrics,
  DataAvailability,
  DataQualityMetadata,
  IngestSource,
  MembershipStateRecord,
  NormalizedAdRecord,
  NormalizedBookingRecord,
  NormalizedMembershipRecord,
  NormalizedRevenueEventRecord,
  TierKey
} from './types'

type RawManifestWrapper = {
  manifest?: {
    source?: IngestSource | string | null
    notes?: unknown
  }
}

type Excludable = {
  exclude_from_kpis?: boolean
  user_id?: string | null
  customer_id?: string | null
}

export type RevenueModelSummary = {
  cash_received: number
  recognized_membership_revenue: number
  one_time_booking_revenue: number
  other_revenue: number
  recognized_total: number
}

export type WeekdayUsageRow = {
  weekday: string
  bookings: number
  booked_hours: number
}

export type CohortConversionRecord = {
  customer_id: string
  first_booking_date: string | null
  member_start_date: string | null
  guest_bookings: number
  converted: boolean
  conversion_lag_days: number | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeSource(value: unknown): IngestSource {
  return value === 'supabase' ? 'supabase' : 'unavailable'
}

function normalizeNotes(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map(item => String(item ?? '').trim())
    .filter(Boolean)
}

function confidenceLabel(score: number): DataQualityMetadata['confidence']['label'] {
  if (score >= 0.8) return 'high'
  if (score >= 0.55) return 'medium'
  return 'low'
}

function isKpiExcludedRow(row: Excludable) {
  return Boolean(row.exclude_from_kpis)
}

export function kpiEligibleRows<T extends Excludable>(rows: T[]) {
  return rows.filter(row => !isKpiExcludedRow(row))
}

function uniqueExcludedAccounts(rows: Excludable[]) {
  const accountKeys = new Set<string>()

  for (const row of rows) {
    if (!isKpiExcludedRow(row)) continue
    const userId = String(row.user_id ?? '').trim()
    const customerId = String(row.customer_id ?? '').trim()
    if (userId) accountKeys.add(`u:${userId}`)
    if (customerId) accountKeys.add(`c:${customerId}`)
  }

  return accountKeys.size
}

function toSourceCompleteness(source: IngestSource) {
  return source === 'supabase' ? 1 : 0
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

function cadenceEndExclusive(start: DateTime, cadence: string | null | undefined) {
  const normalized = String(cadence ?? '').trim().toLowerCase()
  if (normalized === 'daily') return start.plus({ days: 1 })
  if (normalized === 'weekly') return start.plus({ weeks: 1 })
  if (normalized === 'quarterly') return start.plus({ months: 3 })
  if (normalized === 'annual') return start.plus({ months: 12 })
  return start.plus({ months: 1 })
}

function overlapDays(startA: DateTime, endExclusiveA: DateTime, startB: DateTime, endExclusiveB: DateTime) {
  const overlapStart = startA > startB ? startA : startB
  const overlapEnd = endExclusiveA < endExclusiveB ? endExclusiveA : endExclusiveB
  if (overlapEnd <= overlapStart) return 0
  return overlapEnd.diff(overlapStart, 'days').days
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? null
  const left = sorted[mid - 1] ?? 0
  const right = sorted[mid] ?? 0
  return (left + right) / 2
}

async function readManifest(pathname: string, label: string) {
  const raw = await readJsonFile<RawManifestWrapper>(pathname)
  if (!raw?.manifest) {
    return {
      source: 'unavailable' as IngestSource,
      notes: [`No ingest manifest found for ${label}.`]
    }
  }

  const source = normalizeSource(raw.manifest.source)
  const notes = normalizeNotes(raw.manifest.notes)

  if (source === 'unavailable' && notes.length === 0) {
    return {
      source,
      notes: [`${label} data is unavailable from Supabase.`]
    }
  }

  return {
    source,
    notes
  }
}

async function loadAvailability(): Promise<DataAvailability> {
  const [memberships, bookings, revenue, ads] = await Promise.all([
    readManifest(RAW_MEMBERSHIPS_PATH, 'memberships'),
    readManifest(RAW_BOOKINGS_PATH, 'bookings'),
    readManifest(RAW_REVENUE_PATH, 'revenue'),
    readManifest(RAW_ADS_PATH, 'ads')
  ])

  return {
    memberships: memberships.source,
    bookings: bookings.source,
    revenue: revenue.source,
    ads: ads.source,
    notes: {
      memberships: memberships.notes,
      bookings: bookings.notes,
      revenue: revenue.notes,
      ads: ads.notes
    }
  }
}

export type AnalyticsDataSet = {
  memberships: NormalizedMembershipRecord[]
  membershipState: MembershipStateRecord[]
  bookings: NormalizedBookingRecord[]
  revenue: NormalizedRevenueEventRecord[]
  ads: NormalizedAdRecord[]
  availability: DataAvailability
  data_quality: DataQualityMetadata
}

export function buildDataQualityMetadata(input: {
  memberships: NormalizedMembershipRecord[]
  membershipState: MembershipStateRecord[]
  bookings: NormalizedBookingRecord[]
  revenue: NormalizedRevenueEventRecord[]
  ads: NormalizedAdRecord[]
  availability: DataAvailability
}): DataQualityMetadata {
  const sourceCompleteness = {
    memberships: toSourceCompleteness(input.availability.memberships),
    bookings: toSourceCompleteness(input.availability.bookings),
    revenue: toSourceCompleteness(input.availability.revenue),
    ads: toSourceCompleteness(input.availability.ads)
  }

  const rowCounts = {
    memberships: input.memberships.length,
    membership_state: input.membershipState.length,
    bookings: input.bookings.length,
    revenue: input.revenue.length,
    ads: input.ads.length
  }

  const exclusionsApplied = {
    memberships: input.memberships.filter(isKpiExcludedRow).length,
    membership_state: input.membershipState.filter(isKpiExcludedRow).length,
    bookings: input.bookings.filter(isKpiExcludedRow).length,
    revenue: input.revenue.filter(isKpiExcludedRow).length,
    ads: 0,
    accounts: uniqueExcludedAccounts([
      ...input.membershipState,
      ...input.bookings,
      ...input.revenue
    ])
  }

  const warnings: string[] = []
  for (const key of ['memberships', 'bookings', 'revenue', 'ads'] as const) {
    if (input.availability[key] !== 'supabase') {
      const note = input.availability.notes[key]?.[0] ?? `${key} source unavailable`
      warnings.push(`${key}: ${note}`)
    }
  }

  const totalRows = Math.max(
    1,
    rowCounts.memberships + rowCounts.bookings + rowCounts.revenue
  )
  const totalExcluded = exclusionsApplied.memberships + exclusionsApplied.bookings + exclusionsApplied.revenue
  const exclusionRatio = totalExcluded / totalRows

  if (exclusionRatio >= 0.2) {
    warnings.push(`High exclusion ratio (${(exclusionRatio * 100).toFixed(1)}% of KPI candidate rows excluded).`)
  }

  if (rowCounts.bookings < 5) {
    warnings.push('Very low booking row count for period trending.')
  }

  let score = 1
  if (input.availability.memberships !== 'supabase') score -= 0.24
  if (input.availability.bookings !== 'supabase') score -= 0.24
  if (input.availability.revenue !== 'supabase') score -= 0.24
  if (input.availability.ads !== 'supabase') score -= 0.1
  if (rowCounts.bookings < 5) score -= 0.08
  if (rowCounts.revenue < 5) score -= 0.05
  if (exclusionRatio >= 0.2) score -= 0.08

  const normalizedScore = Math.max(0, Math.min(1, Number(score.toFixed(2))))

  return {
    source_completeness: sourceCompleteness,
    row_counts: rowCounts,
    exclusions_applied: exclusionsApplied,
    warnings,
    confidence: {
      score: normalizedScore,
      label: confidenceLabel(normalizedScore)
    }
  }
}

export function parseWeekOfArg() {
  const match = process.argv
    .slice(2)
    .find(arg => arg.startsWith('--week-of='))

  if (!match) return undefined
  return match.split('=')[1]
}

export function safePercentChange(current: number, previous: number) {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous)) return 0
  if (previous === 0) return current === 0 ? 0 : 100
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2))
}

export async function loadAnalyticsData(): Promise<AnalyticsDataSet> {
  const [memberships, membershipState, bookings, revenue, ads, availability] = await Promise.all([
    readJsonFile<NormalizedMembershipRecord[]>(NORMALIZED_MEMBERSHIPS_PATH),
    readJsonFile<MembershipStateRecord[]>(NORMALIZED_MEMBERSHIP_STATE_PATH),
    readJsonFile<NormalizedBookingRecord[]>(NORMALIZED_BOOKINGS_PATH),
    readJsonFile<NormalizedRevenueEventRecord[]>(NORMALIZED_REVENUE_PATH),
    readJsonFile<NormalizedAdRecord[]>(NORMALIZED_ADS_PATH),
    loadAvailability()
  ])

  const dataset = {
    memberships: memberships ?? [],
    membershipState: membershipState ?? [],
    bookings: bookings ?? [],
    revenue: revenue ?? [],
    ads: ads ?? [],
    availability
  }

  return {
    ...dataset,
    data_quality: buildDataQualityMetadata(dataset)
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

export function recognizedMembershipRevenueInRange(rows: NormalizedRevenueEventRecord[], start: DateTime, end: DateTime) {
  const rangeStart = start.startOf('day')
  const rangeEndExclusive = end.plus({ days: 1 }).startOf('day')
  let total = 0

  for (const row of rows) {
    if (String(row.source ?? '').toLowerCase() !== 'membership') continue
    const amount = Number(row.amount ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) continue

    const eventStart = toDateInZone(row.date)?.startOf('day')
    if (!eventStart) continue

    const eventEndExclusive = cadenceEndExclusive(eventStart, row.cadence)
    const totalDays = Math.max(1, eventEndExclusive.diff(eventStart, 'days').days)
    const overlap = overlapDays(eventStart, eventEndExclusive, rangeStart, rangeEndExclusive)
    if (overlap <= 0) continue

    total += amount * (overlap / totalDays)
  }

  return total
}

export function sumRevenueBySourceInRange(
  rows: NormalizedRevenueEventRecord[],
  start: DateTime,
  end: DateTime,
  matcher: (source: string) => boolean
) {
  return rows
    .filter(row => isWithin(row.date, start, end) && matcher(String(row.source ?? '').toLowerCase()))
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
}

export function computeRevenueModelInRange(rows: NormalizedRevenueEventRecord[], start: DateTime, end: DateTime): RevenueModelSummary {
  const cash_received = sumRevenueInRange(rows, start, end)
  const recognized_membership_revenue = recognizedMembershipRevenueInRange(rows, start, end)
  const one_time_booking_revenue = sumRevenueBySourceInRange(rows, start, end, source => source === 'guest_booking')
  const other_revenue = sumRevenueBySourceInRange(
    rows,
    start,
    end,
    source => source !== 'membership' && source !== 'guest_booking'
  )

  return {
    cash_received,
    recognized_membership_revenue,
    one_time_booking_revenue,
    other_revenue,
    recognized_total: recognized_membership_revenue + one_time_booking_revenue + other_revenue
  }
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

export function weekdayBreakdownInRange(rows: NormalizedBookingRecord[], start: DateTime, end: DateTime): WeekdayUsageRow[] {
  const labels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const base = labels.map(weekday => ({
    weekday,
    bookings: 0,
    booked_hours: 0
  }))

  const map = new Map<number, WeekdayUsageRow>()
  for (let idx = 0; idx < base.length; idx += 1) {
    map.set(idx + 1, base[idx]!)
  }

  for (const row of rows) {
    if (String(row.status ?? '').toLowerCase() === 'canceled') continue
    if (!isWithin(row.date, start, end)) continue
    const dt = toDateInZone(row.date)
    if (!dt) continue
    const bucket = map.get(dt.weekday)
    if (!bucket) continue
    bucket.bookings += 1
    bucket.booked_hours += Number(row.hours ?? 0)
  }

  return base
}

export function findWeakestWeekday(rows: WeekdayUsageRow[]) {
  if (!rows.length) return null

  return [...rows]
    .sort((left, right) => {
      if (left.bookings !== right.bookings) return left.bookings - right.bookings
      if (left.booked_hours !== right.booked_hours) return left.booked_hours - right.booked_hours
      return left.weekday.localeCompare(right.weekday)
    })[0] ?? null
}

export function computeCohortConversion(
  bookings: NormalizedBookingRecord[],
  membershipState: MembershipStateRecord[],
  repeatGuestThreshold = analyticsMetricDefinitions.cohort.repeatGuestMinBookings
) {
  const firstBookingByCustomer = new Map<string, DateTime>()
  const firstGuestBookingByCustomer = new Map<string, DateTime>()
  const guestBookingsByCustomer = new Map<string, number>()
  const memberStartByCustomer = new Map<string, DateTime>()

  for (const booking of bookings) {
    if (String(booking.status ?? '').toLowerCase() === 'canceled') continue
    const customerId = String(booking.customer_id ?? '').trim()
    if (!customerId) continue

    const bookingDate = toDateInZone(booking.date)
    if (!bookingDate) continue

    const existingAny = firstBookingByCustomer.get(customerId)
    if (!existingAny || bookingDate < existingAny) {
      firstBookingByCustomer.set(customerId, bookingDate)
    }

    const type = String(booking.booking_type ?? '').toLowerCase()
    const isGuestLike = type !== 'member'
    if (isGuestLike) {
      guestBookingsByCustomer.set(customerId, (guestBookingsByCustomer.get(customerId) ?? 0) + 1)
      const existingGuest = firstGuestBookingByCustomer.get(customerId)
      if (!existingGuest || bookingDate < existingGuest) {
        firstGuestBookingByCustomer.set(customerId, bookingDate)
      }
    }
  }

  for (const member of membershipState) {
    const customerId = String(member.customer_id ?? '').trim()
    if (!customerId) continue
    const createdAt = toDateInZone(member.created_at)
    if (!createdAt) continue
    const existing = memberStartByCustomer.get(customerId)
    if (!existing || createdAt < existing) {
      memberStartByCustomer.set(customerId, createdAt)
    }
  }

  const keys = new Set<string>([
    ...firstBookingByCustomer.keys(),
    ...memberStartByCustomer.keys()
  ])

  const records: CohortConversionRecord[] = []
  const lagDays: number[] = []
  let repeatGuestsNotConverted = 0
  let convertedGuestMembers = 0

  for (const customerId of keys) {
    const firstBooking = firstBookingByCustomer.get(customerId) ?? null
    const firstGuestBooking = firstGuestBookingByCustomer.get(customerId) ?? null
    const memberStart = memberStartByCustomer.get(customerId) ?? null
    const guestBookings = guestBookingsByCustomer.get(customerId) ?? 0

    const converted = Boolean(firstGuestBooking && memberStart && memberStart >= firstGuestBooking)
    const conversionLagDays = converted && firstGuestBooking && memberStart
      ? Number(memberStart.diff(firstGuestBooking.startOf('day'), 'days').days.toFixed(2))
      : null

    if (converted && isFiniteNumber(conversionLagDays)) {
      convertedGuestMembers += 1
      lagDays.push(conversionLagDays)
    } else if (guestBookings >= repeatGuestThreshold) {
      repeatGuestsNotConverted += 1
    }

    records.push({
      customer_id: customerId,
      first_booking_date: firstBooking?.toISODate() ?? null,
      member_start_date: memberStart?.toISODate() ?? null,
      guest_bookings: guestBookings,
      converted,
      conversion_lag_days: conversionLagDays
    })
  }

  const avgLag = lagDays.length
    ? Number((lagDays.reduce((sum, value) => sum + value, 0) / lagDays.length).toFixed(2))
    : null
  const medianLag = median(lagDays)
  const summary: CohortMetrics = {
    repeat_guests_not_converted: repeatGuestsNotConverted,
    converted_guest_members: convertedGuestMembers,
    avg_guest_to_member_lag_days: avgLag,
    median_guest_to_member_lag_days: isFiniteNumber(medianLag) ? Number(medianLag.toFixed(2)) : null
  }

  return {
    summary,
    records: records
      .sort((left, right) => {
        const leftDate = left.first_booking_date ?? '9999-12-31'
        const rightDate = right.first_booking_date ?? '9999-12-31'
        return leftDate.localeCompare(rightDate)
      })
  }
}
