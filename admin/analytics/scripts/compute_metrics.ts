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
import type { MetricsOutput } from './lib/types'

async function run() {
  const weekOf = parseWeekOfArg()
  const context = getWeekContext(weekOf)
  const data = await loadAnalyticsData()

  const revenueCurrent = sumRevenueInRange(data.revenue, context.start, context.end)
  const revenuePrevious = sumRevenueInRange(data.revenue, context.previous_start, context.previous_end)

  const currentBookings = bookingsInRange(data.bookings, context.start, context.end)
    .filter(row => row.status !== 'canceled')

  const bookedHours = bookingsHours(currentBookings)
  const utilizationRate = analyticsMetricDefinitions.weeklyCapacityHours > 0
    ? Number((bookedHours / analyticsMetricDefinitions.weeklyCapacityHours).toFixed(4))
    : 0

  const activeMemberships = activeMembershipStateAt(data.membershipState, context.end)
  const membershipEvents = membershipEventsInRange(data.memberships, context.start, context.end)
  const newMembers = membershipEvents.filter(item => item.is_new).length
  const canceledMembers = membershipEvents.filter(item => item.is_canceled).length
  const tierCounts = tierCountsFromState(activeMemberships)
  const ads = aggregateAds(adsInRange(data.ads, context.start, context.end))

  const output: MetricsOutput = {
    generated_at: new Date().toISOString(),
    week_of: context.week_of,
    week: {
      revenue_total: Number(revenueCurrent.toFixed(2)),
      revenue_wow_pct: safePercentChange(revenueCurrent, revenuePrevious),
      bookings_total: currentBookings.length,
      booked_hours: Number(bookedHours.toFixed(2)),
      utilization_rate: utilizationRate,
      new_members: newMembers,
      canceled_members: canceledMembers,
      net_members: newMembers - canceledMembers,
      active_members: activeMemberships.length
    },
    tiers: {
      creator: tierCounts.creator,
      pro: tierCounts.pro,
      studio_plus: tierCounts.studio_plus
    },
    ads: {
      google: ads.google,
      meta: ads.meta
    }
  }

  await writeJsonFile(METRICS_OUTPUT_PATH, output)
  console.log('[analytics] metrics computed', {
    week_of: output.week_of,
    revenue_total: output.week.revenue_total,
    bookings_total: output.week.bookings_total
  })
}

run().catch((error: unknown) => {
  console.error('[analytics] compute_metrics failed', error)
  process.exitCode = 1
})
