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
import type { TrendsOutput } from './lib/types'

async function run() {
  const weekOf = parseWeekOfArg()
  const context = getWeekContext(weekOf)
  const data = await loadAnalyticsData()

  const weekStarts = listRecentWeekStarts(context.start, analyticsMetricDefinitions.trendsLookbackWeeks)

  const revenueByWeek: TrendsOutput['revenue_by_week'] = []
  const membersByWeek: TrendsOutput['members_by_week'] = []
  const utilizationByWeek: TrendsOutput['utilization_by_week'] = []

  for (const weekStart of weekStarts) {
    const weekEnd = weekStart.endOf('week')
    const weekKey = toIsoWeekFromDate(weekStart)

    const revenue = sumRevenueInRange(data.revenue, weekStart, weekEnd)
    const bookings = bookingsInRange(data.bookings, weekStart, weekEnd)
      .filter(item => item.status !== 'canceled')
    const bookedHours = bookingsHours(bookings)

    const activeMembers = activeMembershipStateAt(data.membershipState, weekEnd)
    const membershipEvents = membershipEventsInRange(data.memberships, weekStart, weekEnd)

    revenueByWeek.push({
      week: weekKey,
      value: Number(revenue.toFixed(2))
    })

    membersByWeek.push({
      week: weekKey,
      active: activeMembers.length,
      new_members: membershipEvents.filter(item => item.is_new).length,
      canceled_members: membershipEvents.filter(item => item.is_canceled).length
    })

    utilizationByWeek.push({
      week: weekKey,
      value: analyticsMetricDefinitions.weeklyCapacityHours > 0
        ? Number((bookedHours / analyticsMetricDefinitions.weeklyCapacityHours).toFixed(4))
        : 0,
      booked_hours: Number(bookedHours.toFixed(2))
    })
  }

  const output: TrendsOutput = {
    generated_at: new Date().toISOString(),
    week_of: context.week_of,
    revenue_by_week: revenueByWeek,
    members_by_week: membersByWeek,
    utilization_by_week: utilizationByWeek
  }

  await writeJsonFile(TRENDS_OUTPUT_PATH, output)
  console.log('[analytics] trends computed', {
    week_of: output.week_of,
    points: output.revenue_by_week.length
  })
}

run().catch((error: unknown) => {
  console.error('[analytics] compute_trends failed', error)
  process.exitCode = 1
})
