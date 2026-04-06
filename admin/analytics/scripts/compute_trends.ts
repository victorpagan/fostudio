import { analyticsMetricDefinitions } from '../config/metric-definitions'
import { TRENDS_OUTPUT_PATH } from './lib/constants'
import { writeJsonFile } from './lib/fs'
import {
  activeMembershipStateAt,
  bookingsHours,
  bookingsInRange,
  getWeekContext,
  listRecentWeekStarts,
  loadAnalyticsData,
  membershipEventsInRange,
  parseWeekOfArg,
  sumRevenueInRange,
  toIsoWeekFromDate
} from './lib/analytics'
import type { IngestSource, TrendsOutput } from './lib/types'

function isAvailable(source: IngestSource) {
  return source === 'supabase'
}

async function run() {
  const weekOf = parseWeekOfArg()
  const context = getWeekContext(weekOf)
  const data = await loadAnalyticsData()

  const weekStarts = listRecentWeekStarts(context.start, analyticsMetricDefinitions.trendsLookbackWeeks)

  const revenueByWeek: TrendsOutput['revenue_by_week'] = []
  const membersByWeek: TrendsOutput['members_by_week'] = []
  const utilizationByWeek: TrendsOutput['utilization_by_week'] = []

  const revenueAvailable = isAvailable(data.availability.revenue)
  const membershipsAvailable = isAvailable(data.availability.memberships)
  const bookingsAvailable = isAvailable(data.availability.bookings)

  for (const weekStart of weekStarts) {
    const weekEnd = weekStart.endOf('week')
    const weekKey = toIsoWeekFromDate(weekStart)

    if (revenueAvailable) {
      const revenue = sumRevenueInRange(data.revenue, weekStart, weekEnd)
      revenueByWeek.push({
        week: weekKey,
        value: Number(revenue.toFixed(2))
      })
    }

    if (membershipsAvailable) {
      const activeMembers = activeMembershipStateAt(data.membershipState, weekEnd)
      const membershipEvents = membershipEventsInRange(data.memberships, weekStart, weekEnd)

      membersByWeek.push({
        week: weekKey,
        active: activeMembers.length,
        new_members: membershipEvents.filter(item => item.is_new).length,
        canceled_members: membershipEvents.filter(item => item.is_canceled).length
      })
    }

    if (bookingsAvailable) {
      const bookings = bookingsInRange(data.bookings, weekStart, weekEnd)
        .filter(item => item.status !== 'canceled')
      const bookedHours = bookingsHours(bookings)

      utilizationByWeek.push({
        week: weekKey,
        value: analyticsMetricDefinitions.weeklyCapacityHours > 0
          ? Number((bookedHours / analyticsMetricDefinitions.weeklyCapacityHours).toFixed(4))
          : 0,
        booked_hours: Number(bookedHours.toFixed(2))
      })
    }
  }

  const output: TrendsOutput = {
    generated_at: new Date().toISOString(),
    week_of: context.week_of,
    data_availability: data.availability,
    revenue_by_week: revenueByWeek,
    members_by_week: membersByWeek,
    utilization_by_week: utilizationByWeek
  }

  await writeJsonFile(TRENDS_OUTPUT_PATH, output)
  console.log('[analytics] trends computed', {
    week_of: output.week_of,
    revenue_points: output.revenue_by_week.length,
    member_points: output.members_by_week.length,
    utilization_points: output.utilization_by_week.length
  })
}

run().catch((error: unknown) => {
  console.error('[analytics] compute_trends failed', error)
  process.exitCode = 1
})
