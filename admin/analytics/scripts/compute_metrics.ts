import { analyticsMetricDefinitions } from '../config/metric-definitions'
import { METRICS_OUTPUT_PATH } from './lib/constants'
import { writeJsonFile } from './lib/fs'
import {
  activeMembershipStateAt,
  adsInRange,
  aggregateAds,
  bookingsHours,
  bookingsInRange,
  computeCohortConversion,
  computeRevenueModelInRange,
  getWeekContext,
  kpiEligibleRows,
  loadAnalyticsData,
  membershipEventsInRange,
  parseWeekOfArg,
  safePercentChange,
  tierCountsFromState
} from './lib/analytics'
import type { IngestSource, MetricsOutput, PlatformSummary, TierKey } from './lib/types'

function isAvailable(source: IngestSource) {
  return source === 'supabase'
}

function roundMaybe(value: number | null, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Number(value.toFixed(digits))
}

function computeTierUsagePct(input: {
  tier: TierKey
  activeMembers: Array<{ user_id: string | null, tier: TierKey }>
  bookingsLast30: Array<{ user_id: string | null, hours: number }>
}) {
  if (input.tier === 'other') return null

  const memberIds = new Set(
    input.activeMembers
      .filter(member => member.tier === input.tier)
      .map(member => String(member.user_id ?? '').trim())
      .filter(Boolean)
  )

  if (memberIds.size === 0) return null

  const includedHours = analyticsMetricDefinitions.tierIncludedHoursPerMonth[input.tier] * memberIds.size
  if (includedHours <= 0) return null

  const bookedHours = input.bookingsLast30
    .filter(booking => booking.user_id && memberIds.has(String(booking.user_id)))
    .reduce((sum, booking) => sum + Number(booking.hours ?? 0), 0)

  return Number((bookedHours / includedHours).toFixed(4))
}

function toNullUsageBlock(): MetricsOutput['member_usage'] {
  return {
    bookings_per_member_7d: null,
    bookings_per_member_30d: null,
    booked_hours_per_member_30d: null,
    members_with_zero_bookings_14d: null,
    members_with_zero_bookings_30d: null,
    tier_usage_pct: {
      creator: null,
      pro: null,
      studio_plus: null
    }
  }
}

function toNullSegmentation(): MetricsOutput['booking_segmentation'] {
  return {
    member: {
      bookings: null,
      booked_hours: null,
      revenue: null
    },
    non_member: {
      bookings: null,
      booked_hours: null,
      revenue: null
    }
  }
}

function toNullCohorts(): MetricsOutput['cohorts'] {
  return {
    repeat_guests_not_converted: null,
    converted_guest_members: null,
    avg_guest_to_member_lag_days: null,
    median_guest_to_member_lag_days: null
  }
}

async function run() {
  const weekOf = parseWeekOfArg()
  const context = getWeekContext(weekOf)
  const data = await loadAnalyticsData()

  const revenueAvailable = isAvailable(data.availability.revenue)
  const bookingsAvailable = isAvailable(data.availability.bookings)
  const membershipsAvailable = isAvailable(data.availability.memberships)
  const adsAvailable = isAvailable(data.availability.ads)

  const kpiBookings = kpiEligibleRows(data.bookings)
  const kpiRevenue = kpiEligibleRows(data.revenue)
  const kpiMembershipEvents = kpiEligibleRows(data.memberships)
  const kpiMembershipState = kpiEligibleRows(data.membershipState)

  const currentBookings = bookingsAvailable
    ? bookingsInRange(kpiBookings, context.start, context.end).filter(row => row.status !== 'canceled')
    : []
  const bookedHours = bookingsAvailable ? bookingsHours(currentBookings) : null
  const utilizationRate = (bookingsAvailable && typeof bookedHours === 'number' && analyticsMetricDefinitions.weeklyCapacityHours > 0)
    ? Number((bookedHours / analyticsMetricDefinitions.weeklyCapacityHours).toFixed(4))
    : null

  const activeMemberships = membershipsAvailable
    ? activeMembershipStateAt(kpiMembershipState, context.end)
    : []

  const membershipEvents = membershipsAvailable
    ? membershipEventsInRange(kpiMembershipEvents, context.start, context.end)
    : []

  const newMembers = membershipsAvailable ? membershipEvents.filter(item => item.is_new).length : null
  const canceledMembers = membershipsAvailable ? membershipEvents.filter(item => item.is_canceled).length : null
  const tierCounts = membershipsAvailable ? tierCountsFromState(activeMemberships) : null

  const revenueCurrent = revenueAvailable
    ? computeRevenueModelInRange(kpiRevenue, context.start, context.end)
    : null
  const revenuePrevious = revenueAvailable
    ? computeRevenueModelInRange(kpiRevenue, context.previous_start, context.previous_end)
    : null

  const adSummary = adsAvailable
    ? aggregateAds(adsInRange(data.ads, context.start, context.end))
    : null

  const ads: MetricsOutput['ads'] = {
    google: adSummary ? adSummary.google as PlatformSummary : null,
    meta: adSummary ? adSummary.meta as PlatformSummary : null
  }

  let usageBlock = toNullUsageBlock()
  if (bookingsAvailable && membershipsAvailable) {
    const activeMemberIds = new Set(
      activeMemberships
        .map(member => String(member.user_id ?? '').trim())
        .filter(Boolean)
    )

    const days7Start = context.end.minus({ days: analyticsMetricDefinitions.usageLookbackDays.short - 1 }).startOf('day')
    const days14Start = context.end.minus({ days: analyticsMetricDefinitions.usageLookbackDays.medium - 1 }).startOf('day')
    const days30Start = context.end.minus({ days: analyticsMetricDefinitions.usageLookbackDays.long - 1 }).startOf('day')

    const bookings7 = bookingsInRange(kpiBookings, days7Start, context.end)
      .filter(row => row.status !== 'canceled' && row.user_id && activeMemberIds.has(String(row.user_id)))
    const bookings14 = bookingsInRange(kpiBookings, days14Start, context.end)
      .filter(row => row.status !== 'canceled' && row.user_id && activeMemberIds.has(String(row.user_id)))
    const bookings30 = bookingsInRange(kpiBookings, days30Start, context.end)
      .filter(row => row.status !== 'canceled' && row.user_id && activeMemberIds.has(String(row.user_id)))

    const activeMemberCount = activeMemberIds.size
    const bookings30Hours = bookingsHours(bookings30)

    const usedMemberIds14 = new Set(bookings14.map(row => String(row.user_id)))
    const usedMemberIds30 = new Set(bookings30.map(row => String(row.user_id)))

    const membersWithZero14 = [...activeMemberIds].filter(id => !usedMemberIds14.has(id)).length
    const membersWithZero30 = [...activeMemberIds].filter(id => !usedMemberIds30.has(id)).length

    usageBlock = {
      bookings_per_member_7d: activeMemberCount > 0 ? roundMaybe(bookings7.length / activeMemberCount, 3) : null,
      bookings_per_member_30d: activeMemberCount > 0 ? roundMaybe(bookings30.length / activeMemberCount, 3) : null,
      booked_hours_per_member_30d: activeMemberCount > 0 ? roundMaybe(bookings30Hours / activeMemberCount, 3) : null,
      members_with_zero_bookings_14d: activeMemberCount > 0 ? membersWithZero14 : null,
      members_with_zero_bookings_30d: activeMemberCount > 0 ? membersWithZero30 : null,
      tier_usage_pct: {
        creator: computeTierUsagePct({ tier: 'creator', activeMembers: activeMemberships, bookingsLast30: bookings30 }),
        pro: computeTierUsagePct({ tier: 'pro', activeMembers: activeMemberships, bookingsLast30: bookings30 }),
        studio_plus: computeTierUsagePct({ tier: 'studio_plus', activeMembers: activeMemberships, bookingsLast30: bookings30 })
      }
    }
  }

  let segmentation = toNullSegmentation()
  if (bookingsAvailable) {
    const memberRows = currentBookings.filter(row => row.booking_type === 'member')
    const nonMemberRows = currentBookings.filter(row => row.booking_type !== 'member')

    segmentation = {
      member: {
        bookings: memberRows.length,
        booked_hours: roundMaybe(bookingsHours(memberRows)),
        revenue: roundMaybe(memberRows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0))
      },
      non_member: {
        bookings: nonMemberRows.length,
        booked_hours: roundMaybe(bookingsHours(nonMemberRows)),
        revenue: roundMaybe(nonMemberRows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0))
      }
    }
  }

  const cohorts = (bookingsAvailable && membershipsAvailable)
    ? computeCohortConversion(kpiBookings, kpiMembershipState).summary
    : toNullCohorts()

  const recognizedCurrent = revenueCurrent?.recognized_total ?? null
  const recognizedPrevious = revenuePrevious?.recognized_total ?? null
  const cashCurrent = revenueCurrent?.cash_received ?? null
  const cashPrevious = revenuePrevious?.cash_received ?? null

  const output: MetricsOutput = {
    generated_at: new Date().toISOString(),
    week_of: context.week_of,
    data_availability: data.availability,
    data_quality: data.data_quality,
    week: {
      // Keep legacy revenue fields, but make them recognized (not pure cash) to reduce timing noise.
      revenue_total: roundMaybe(recognizedCurrent),
      revenue_wow_pct: (typeof recognizedCurrent === 'number' && typeof recognizedPrevious === 'number')
        ? safePercentChange(recognizedCurrent, recognizedPrevious)
        : null,
      cash_received: roundMaybe(cashCurrent),
      cash_received_wow_pct: (typeof cashCurrent === 'number' && typeof cashPrevious === 'number')
        ? safePercentChange(cashCurrent, cashPrevious)
        : null,
      recognized_revenue_total: roundMaybe(recognizedCurrent),
      recognized_revenue_wow_pct: (typeof recognizedCurrent === 'number' && typeof recognizedPrevious === 'number')
        ? safePercentChange(recognizedCurrent, recognizedPrevious)
        : null,
      recognized_membership_revenue: roundMaybe(revenueCurrent?.recognized_membership_revenue ?? null),
      one_time_booking_revenue: roundMaybe(revenueCurrent?.one_time_booking_revenue ?? null),
      other_revenue: roundMaybe(revenueCurrent?.other_revenue ?? null),
      bookings_total: bookingsAvailable ? currentBookings.length : null,
      booked_hours: roundMaybe(bookedHours),
      utilization_rate: utilizationRate,
      new_members: newMembers,
      canceled_members: canceledMembers,
      net_members: (typeof newMembers === 'number' && typeof canceledMembers === 'number')
        ? newMembers - canceledMembers
        : null,
      active_members: membershipsAvailable ? activeMemberships.length : null
    },
    member_usage: usageBlock,
    booking_segmentation: segmentation,
    cohorts,
    tiers: {
      creator: tierCounts ? tierCounts.creator : null,
      pro: tierCounts ? tierCounts.pro : null,
      studio_plus: tierCounts ? tierCounts.studio_plus : null
    },
    ads
  }

  await writeJsonFile(METRICS_OUTPUT_PATH, output)
  console.log('[analytics] metrics computed', {
    week_of: output.week_of,
    recognized_revenue_total: output.week.recognized_revenue_total,
    cash_received: output.week.cash_received,
    bookings_total: output.week.bookings_total,
    active_members: output.week.active_members
  })
}

run().catch((error: unknown) => {
  console.error('[analytics] compute_metrics failed', error)
  process.exitCode = 1
})
