import { analyticsMetricDefinitions } from '../config/metric-definitions'
import { DateTime } from 'luxon'
import { TRENDS_OUTPUT_PATH } from './lib/constants'
import { writeJsonFile } from './lib/fs'
import {
  activeMembershipStateAt,
  bookingsHours,
  bookingsInRange,
  computeCohortConversion,
  computeRevenueModelInRange,
  findWeakestWeekday,
  getWeekContext,
  kpiEligibleRows,
  listRecentWeekStarts,
  loadAnalyticsData,
  membershipEventsInRange,
  parseWeekOfArg,
  toIsoWeekFromDate,
  weekdayBreakdownInRange
} from './lib/analytics'
import type { IngestSource, TrendsOutput } from './lib/types'

function isAvailable(source: IngestSource) {
  return source === 'supabase'
}

function isWithinRange(iso: string | null | undefined, start: DateTime, end: DateTime) {
  if (!iso) return false
  const parsed = DateTime.fromISO(iso, { zone: analyticsMetricDefinitions.timezone })
  if (!parsed.isValid) return false
  return parsed >= start && parsed <= end
}

function parseIsoInZone(iso: string | null | undefined) {
  if (!iso) return null
  const local = DateTime.fromISO(iso, { zone: analyticsMetricDefinitions.timezone })
  if (local.isValid) return local
  const utc = DateTime.fromISO(iso, { zone: 'utc' })
  return utc.isValid ? utc.setZone(analyticsMetricDefinitions.timezone) : null
}

async function run() {
  const weekOf = parseWeekOfArg()
  const context = getWeekContext(weekOf)
  const data = await loadAnalyticsData()

  const kpiBookings = kpiEligibleRows(data.bookings)
  const kpiRevenue = kpiEligibleRows(data.revenue)
  const kpiMembershipEvents = kpiEligibleRows(data.memberships)
  const kpiMembershipState = kpiEligibleRows(data.membershipState)

  const weekStarts = listRecentWeekStarts(context.start, analyticsMetricDefinitions.trendsLookbackWeeks)

  const revenueByWeek: TrendsOutput['revenue_by_week'] = []
  const cashByWeek: TrendsOutput['cash_received_by_week'] = []
  const recognizedByWeek: TrendsOutput['recognized_revenue_by_week'] = []
  const oneTimeByWeek: TrendsOutput['one_time_booking_revenue_by_week'] = []
  const membersByWeek: TrendsOutput['members_by_week'] = []
  const utilizationByWeek: TrendsOutput['utilization_by_week'] = []
  const incidentsCreatedByWeek: TrendsOutput['incidents_created_by_week'] = []
  const incidentsOpenByWeek: TrendsOutput['incidents_open_by_week'] = []
  const expensesSubmittedByWeek: TrendsOutput['expenses_submitted_by_week'] = []
  const expensesPaidByWeek: TrendsOutput['expenses_paid_by_week'] = []
  const bookingMixByWeek: TrendsOutput['booking_mix_by_week'] = []

  const revenueAvailable = isAvailable(data.availability.revenue)
  const membershipsAvailable = isAvailable(data.availability.memberships)
  const bookingsAvailable = isAvailable(data.availability.bookings)
  const opsAvailable = isAvailable(data.availability.ops)

  for (const weekStart of weekStarts) {
    const weekEnd = weekStart.endOf('week')
    const weekKey = toIsoWeekFromDate(weekStart)

    if (revenueAvailable) {
      const model = computeRevenueModelInRange(kpiRevenue, weekStart, weekEnd)
      revenueByWeek.push({
        week: weekKey,
        value: Number(model.recognized_total.toFixed(2))
      })
      cashByWeek.push({
        week: weekKey,
        value: Number(model.cash_received.toFixed(2))
      })
      recognizedByWeek.push({
        week: weekKey,
        value: Number(model.recognized_total.toFixed(2))
      })
      oneTimeByWeek.push({
        week: weekKey,
        value: Number(model.one_time_booking_revenue.toFixed(2))
      })
    }

    if (membershipsAvailable) {
      const activeMembers = activeMembershipStateAt(kpiMembershipState, weekEnd)
      const membershipEvents = membershipEventsInRange(kpiMembershipEvents, weekStart, weekEnd)

      membersByWeek.push({
        week: weekKey,
        active: activeMembers.length,
        new_members: membershipEvents.filter(item => item.is_new).length,
        canceled_members: membershipEvents.filter(item => item.is_canceled).length
      })
    }

    if (bookingsAvailable) {
      const bookings = bookingsInRange(kpiBookings, weekStart, weekEnd)
        .filter(item => item.status !== 'canceled')
      const memberRows = bookings.filter(item => item.booking_type === 'member')
      const nonMemberRows = bookings.filter(item => item.booking_type !== 'member')
      const bookedHours = bookingsHours(bookings)

      utilizationByWeek.push({
        week: weekKey,
        value: analyticsMetricDefinitions.weeklyCapacityHours > 0
          ? Number((bookedHours / analyticsMetricDefinitions.weeklyCapacityHours).toFixed(4))
          : 0,
        booked_hours: Number(bookedHours.toFixed(2))
      })

      bookingMixByWeek.push({
        week: weekKey,
        member_bookings: memberRows.length,
        non_member_bookings: nonMemberRows.length,
        member_booked_hours: Number(bookingsHours(memberRows).toFixed(2)),
        non_member_booked_hours: Number(bookingsHours(nonMemberRows).toFixed(2)),
        member_revenue: Number(memberRows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0).toFixed(2)),
        non_member_revenue: Number(nonMemberRows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0).toFixed(2))
      })
    }

    if (opsAvailable) {
      const incidentsCreated = data.incidents.filter(row => isWithinRange(row.created_at, weekStart, weekEnd)).length
      const incidentsOpen = data.incidents.filter((row) => {
        const openedAt = parseIsoInZone(row.occurred_at ?? row.created_at)
        if (!openedAt || openedAt > weekEnd) return false

        const closedAt = parseIsoInZone(row.closed_at ?? row.resolved_at)
        if (closedAt && closedAt <= weekEnd) return false

        return true
      }).length
      const submittedRows = data.expenses.filter(row => isWithinRange(row.submitted_at, weekStart, weekEnd))
      const paidRows = data.expenses.filter(row => isWithinRange(row.paid_at, weekStart, weekEnd))

      incidentsCreatedByWeek.push({ week: weekKey, value: incidentsCreated })
      incidentsOpenByWeek.push({ week: weekKey, value: incidentsOpen })
      expensesSubmittedByWeek.push({
        week: weekKey,
        value: submittedRows.length,
        amount: Number(submittedRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0).toFixed(2))
      })
      expensesPaidByWeek.push({
        week: weekKey,
        value: paidRows.length,
        amount: Number(paidRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0).toFixed(2))
      })
    }
  }

  const weekdayLookbackStart = context.start
    .minus({ weeks: Math.max(1, analyticsMetricDefinitions.weekdayLookbackWeeks) - 1 })
    .startOf('week')
  const weekdayRows = bookingsAvailable
    ? weekdayBreakdownInRange(kpiBookings, weekdayLookbackStart, context.end)
    : []
  const weakestWeekday = findWeakestWeekday(weekdayRows)

  const cohort = (bookingsAvailable && membershipsAvailable)
    ? computeCohortConversion(kpiBookings, kpiMembershipState)
    : { summary: { repeat_guests_not_converted: 0, converted_guest_members: 0, avg_guest_to_member_lag_days: null, median_guest_to_member_lag_days: null }, records: [] }

  const output: TrendsOutput = {
    generated_at: new Date().toISOString(),
    week_of: context.week_of,
    data_availability: data.availability,
    data_quality: data.data_quality,
    revenue_by_week: revenueByWeek,
    cash_received_by_week: cashByWeek,
    recognized_revenue_by_week: recognizedByWeek,
    one_time_booking_revenue_by_week: oneTimeByWeek,
    members_by_week: membersByWeek,
    utilization_by_week: utilizationByWeek,
    incidents_created_by_week: incidentsCreatedByWeek,
    incidents_open_by_week: incidentsOpenByWeek,
    expenses_submitted_by_week: expensesSubmittedByWeek,
    expenses_paid_by_week: expensesPaidByWeek,
    booking_mix_by_week: bookingMixByWeek,
    weekday_utilization: {
      lookback_weeks: analyticsMetricDefinitions.weekdayLookbackWeeks,
      bookings_by_weekday: weekdayRows.map(row => ({ weekday: row.weekday, value: row.bookings })),
      booked_hours_by_weekday: weekdayRows.map(row => ({ weekday: row.weekday, value: Number(row.booked_hours.toFixed(2)) })),
      weakest_day: weakestWeekday
        ? {
            weekday: weakestWeekday.weekday,
            bookings: weakestWeekday.bookings,
            booked_hours: Number(weakestWeekday.booked_hours.toFixed(2))
          }
        : null
    },
    cohort_conversion: {
      repeat_guests_not_converted: cohort.summary.repeat_guests_not_converted ?? 0,
      converted_guest_members: cohort.summary.converted_guest_members ?? 0,
      avg_guest_to_member_lag_days: cohort.summary.avg_guest_to_member_lag_days,
      median_guest_to_member_lag_days: cohort.summary.median_guest_to_member_lag_days,
      records: cohort.records
    }
  }

  await writeJsonFile(TRENDS_OUTPUT_PATH, output)
  console.log('[analytics] trends computed', {
    week_of: output.week_of,
    recognized_revenue_points: output.recognized_revenue_by_week.length,
    member_points: output.members_by_week.length,
    utilization_points: output.utilization_by_week.length,
    cohort_records: output.cohort_conversion.records.length
  })
}

run().catch((error: unknown) => {
  console.error('[analytics] compute_trends failed', error)
  process.exitCode = 1
})
