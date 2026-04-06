import { analyticsMetricDefinitions } from '../config/metric-definitions'
import { METRICS_OUTPUT_PATH } from './lib/constants'
import { writeJsonFile } from './lib/fs'
import {
  activeMembershipStateAt,
  adsInRange,
  aggregateAds,
  bookingsHours,
  bookingsInRange,
  getWeekContext,
  loadAnalyticsData,
  membershipEventsInRange,
  parseWeekOfArg,
  safePercentChange,
  sumRevenueInRange,
  tierCountsFromState
} from './lib/analytics'
import type { IngestSource, MetricsOutput, PlatformSummary } from './lib/types'

function isAvailable(source: IngestSource) {
  return source === 'supabase'
}

function round(value: number) {
  return Number(value.toFixed(2))
}

function roundMaybe(value: number | null, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Number(value.toFixed(digits))
}

async function run() {
  const weekOf = parseWeekOfArg()
  const context = getWeekContext(weekOf)
  const data = await loadAnalyticsData()

  const revenueAvailable = isAvailable(data.availability.revenue)
  const bookingsAvailable = isAvailable(data.availability.bookings)
  const membershipsAvailable = isAvailable(data.availability.memberships)
  const adsAvailable = isAvailable(data.availability.ads)

  const revenueCurrent = revenueAvailable
    ? sumRevenueInRange(data.revenue, context.start, context.end)
    : null

  const revenuePrevious = revenueAvailable
    ? sumRevenueInRange(data.revenue, context.previous_start, context.previous_end)
    : null

  const currentBookings = bookingsAvailable
    ? bookingsInRange(data.bookings, context.start, context.end).filter(row => row.status !== 'canceled')
    : []

  const bookedHours = bookingsAvailable ? bookingsHours(currentBookings) : null
  const utilizationRate = (bookingsAvailable && typeof bookedHours === 'number' && analyticsMetricDefinitions.weeklyCapacityHours > 0)
    ? Number((bookedHours / analyticsMetricDefinitions.weeklyCapacityHours).toFixed(4))
    : null

  const activeMemberships = membershipsAvailable
    ? activeMembershipStateAt(data.membershipState, context.end)
    : []

  const membershipEvents = membershipsAvailable
    ? membershipEventsInRange(data.memberships, context.start, context.end)
    : []

  const newMembers = membershipsAvailable ? membershipEvents.filter(item => item.is_new).length : null
  const canceledMembers = membershipsAvailable ? membershipEvents.filter(item => item.is_canceled).length : null
  const tierCounts = membershipsAvailable ? tierCountsFromState(activeMemberships) : null

  const adSummary = adsAvailable
    ? aggregateAds(adsInRange(data.ads, context.start, context.end))
    : null

  const ads: MetricsOutput['ads'] = {
    google: adSummary
      ? adSummary.google as PlatformSummary
      : null,
    meta: adSummary
      ? adSummary.meta as PlatformSummary
      : null
  }

  const output: MetricsOutput = {
    generated_at: new Date().toISOString(),
    week_of: context.week_of,
    data_availability: data.availability,
    week: {
      revenue_total: roundMaybe(revenueCurrent),
      revenue_wow_pct: (typeof revenueCurrent === 'number' && typeof revenuePrevious === 'number')
        ? safePercentChange(revenueCurrent, revenuePrevious)
        : null,
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
    revenue_total: typeof output.week.revenue_total === 'number' ? round(output.week.revenue_total) : null,
    bookings_total: output.week.bookings_total
  })
}

run().catch((error: unknown) => {
  console.error('[analytics] compute_metrics failed', error)
  process.exitCode = 1
})
