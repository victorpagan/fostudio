import { DateTime } from 'luxon'
import { analyticsAlertThresholds } from '../config/alert-thresholds'
import { analyticsMetricDefinitions } from '../config/metric-definitions'
import { ALERTS_OUTPUT_PATH, METRICS_OUTPUT_PATH } from './lib/constants'
import { writeJsonFile, readJsonFile } from './lib/fs'
import {
  activeMembershipStateAt,
  adsInRange,
  aggregateAds,
  bookingsInRange,
  getWeekContext,
  loadAnalyticsData,
  membershipEventsInRange,
  parseWeekOfArg
} from './lib/analytics'
import type { AlertsOutputItem, DataAvailability, IngestSource, MetricsOutput } from './lib/types'

type AvailabilityKey = 'memberships' | 'bookings' | 'revenue' | 'ads'

function toWeekdayLabel(value: number) {
  const labels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  return labels[value - 1] ?? 'Unknown'
}

function weekdayNameToIsoNumber(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'monday') return 1
  if (normalized === 'tuesday') return 2
  if (normalized === 'wednesday') return 3
  if (normalized === 'thursday') return 4
  if (normalized === 'friday') return 5
  if (normalized === 'saturday') return 6
  if (normalized === 'sunday') return 7
  return 3
}

function isAvailable(source: IngestSource) {
  return source === 'supabase'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function addUnavailableAlert(alerts: AlertsOutputItem[], availability: DataAvailability, key: AvailabilityKey, title: string, detailPrefix: string) {
  const source = availability[key] as IngestSource
  if (isAvailable(source)) return

  const note = availability.notes[key]?.[0]
  alerts.push({
    severity: 'medium',
    type: 'data',
    title,
    detail: note ? `${detailPrefix} ${note}` : detailPrefix
  })
}

async function run() {
  const weekOf = parseWeekOfArg()
  const context = getWeekContext(weekOf)
  const data = await loadAnalyticsData()

  const alerts: AlertsOutputItem[] = []
  const metrics = await readJsonFile<MetricsOutput>(METRICS_OUTPUT_PATH)
  const availability = metrics?.data_availability ?? data.availability

  addUnavailableAlert(
    alerts,
    availability,
    'ads',
    'Ads data unavailable',
    'Google/Meta ad performance is unavailable, so paid-channel metrics and CPA alerts may be incomplete.'
  )
  addUnavailableAlert(
    alerts,
    availability,
    'bookings',
    'Bookings data unavailable',
    'Booking data is unavailable, so utilization and booking trend alerts may be incomplete.'
  )
  addUnavailableAlert(
    alerts,
    availability,
    'memberships',
    'Membership data unavailable',
    'Membership data is unavailable, so retention/churn alerts may be incomplete.'
  )
  addUnavailableAlert(
    alerts,
    availability,
    'revenue',
    'Revenue data unavailable',
    'Revenue data is unavailable, so revenue trend alerts may be incomplete.'
  )

  if (isAvailable(availability.ads)) {
    const adWindowStart = context.end.minus({ days: analyticsAlertThresholds.adPerformance.cpaComparisonWindowDays - 1 }).startOf('day')
    const adRows = adsInRange(data.ads, adWindowStart, context.end)
    const adSummary = aggregateAds(adRows)

    if (
      adSummary.meta.spend >= analyticsAlertThresholds.adPerformance.weakChannelMinSpend
      && adSummary.meta.conversions <= analyticsAlertThresholds.adPerformance.weakChannelMinConversions
    ) {
      alerts.push({
        severity: 'high',
        type: 'ads',
        title: 'Meta weak conversion efficiency',
        detail: `Meta spent $${adSummary.meta.spend.toFixed(2)} with ${adSummary.meta.conversions} conversions in the last ${analyticsAlertThresholds.adPerformance.cpaComparisonWindowDays} days.`
      })
    }

    if (adSummary.google.cost_per_conversion > 0 && adSummary.meta.cost_per_conversion > 0) {
      const ratio = adSummary.meta.cost_per_conversion / adSummary.google.cost_per_conversion
      if (ratio >= analyticsAlertThresholds.adPerformance.highCpaMultiplier) {
        alerts.push({
          severity: 'high',
          type: 'ads',
          title: 'Meta underperforming Google',
          detail: `Meta CPA is ${ratio.toFixed(1)}x Google over the last ${analyticsAlertThresholds.adPerformance.cpaComparisonWindowDays} days.`
        })
      }
    }
  }

  if (isAvailable(availability.memberships) && isAvailable(availability.bookings)) {
    const activeMembers = activeMembershipStateAt(data.membershipState, context.end)
    const creatorMembers = activeMembers.filter(member => member.tier === 'creator')

    const lowUsageWindowStart = context.end.minus({ days: analyticsAlertThresholds.retention.lowUsageLookbackDays - 1 }).startOf('day')
    const creatorByUser = new Set(creatorMembers.map(member => member.user_id))

    const usageByUser = new Map<string, number>()
    const recentBookings = bookingsInRange(data.bookings, lowUsageWindowStart, context.end)
      .filter(booking => booking.status !== 'canceled' && booking.user_id && creatorByUser.has(booking.user_id))

    for (const booking of recentBookings) {
      const userId = String(booking.user_id)
      usageByUser.set(userId, (usageByUser.get(userId) ?? 0) + Number(booking.hours ?? 0))
    }

    const creatorIncludedHours = analyticsMetricDefinitions.tierIncludedHoursPerMonth.creator
    const lowUsageMembers = creatorMembers.filter((member) => {
      const usageHours = usageByUser.get(member.user_id) ?? 0
      const usageRatio = creatorIncludedHours > 0 ? usageHours / creatorIncludedHours : 0
      return usageRatio < analyticsAlertThresholds.retention.lowUsageThreshold
    })

    if (lowUsageMembers.length >= analyticsAlertThresholds.retention.lowUsageMinMembers) {
      alerts.push({
        severity: 'medium',
        type: 'retention',
        title: 'Low usage in Creator tier',
        detail: `${lowUsageMembers.length} Creator members used less than ${(analyticsAlertThresholds.retention.lowUsageThreshold * 100).toFixed(0)}% of included hours in the last ${analyticsAlertThresholds.retention.lowUsageLookbackDays} days.`
      })
    }

    const membershipsThisWeek = membershipEventsInRange(data.memberships, context.start, context.end)
    const canceledCount = membershipsThisWeek.filter(item => item.is_canceled).length
    if (canceledCount >= analyticsAlertThresholds.memberships.churnWarningCount) {
      alerts.push({
        severity: 'medium',
        type: 'memberships',
        title: 'Weekly churn pressure increased',
        detail: `${canceledCount} membership cancellations were recorded this week.`
      })
    }
  }

  if (isAvailable(availability.bookings)) {
    const currentBookings = bookingsInRange(data.bookings, context.start, context.end).filter(item => item.status !== 'canceled')
    const previousBookings = bookingsInRange(data.bookings, context.previous_start, context.previous_end).filter(item => item.status !== 'canceled')

    if (previousBookings.length > 0) {
      const dropRatio = (previousBookings.length - currentBookings.length) / previousBookings.length
      if (dropRatio >= analyticsAlertThresholds.bookings.wowDropPct) {
        alerts.push({
          severity: 'medium',
          type: 'bookings',
          title: 'Bookings down week-over-week',
          detail: `Bookings fell by ${(dropRatio * 100).toFixed(1)}% compared with last week (${currentBookings.length} vs ${previousBookings.length}).`
        })
      }
    }

    const weekdayLookbackStart = context.start.minus({ weeks: 8 }).startOf('week')
    const weekdayRows = bookingsInRange(data.bookings, weekdayLookbackStart, context.end)
      .filter(item => item.status !== 'canceled')

    const weekdayCounts = new Map<number, number>()
    for (const row of weekdayRows) {
      const dt = DateTime.fromISO(row.date, { zone: analyticsMetricDefinitions.timezone })
      if (!dt.isValid) continue
      const day = dt.weekday
      weekdayCounts.set(day, (weekdayCounts.get(day) ?? 0) + 1)
    }

    const totalBookings = [...weekdayCounts.values()].reduce((sum, value) => sum + value, 0)
    const avgPerDay = totalBookings / 7
    const weakWeekdayNumber = weekdayNameToIsoNumber(analyticsAlertThresholds.bookings.weakWeekdayName)
    const weakDayValue = weekdayCounts.get(weakWeekdayNumber) ?? 0

    if (avgPerDay > 0 && weakDayValue < (avgPerDay * analyticsAlertThresholds.bookings.weakWeekdayRatio)) {
      alerts.push({
        severity: 'medium',
        type: 'channel',
        title: `${analyticsAlertThresholds.bookings.weakWeekdayName} bookings remain weak`,
        detail: `${toWeekdayLabel(weakWeekdayNumber)} bookings are ${((1 - (weakDayValue / avgPerDay)) * 100).toFixed(0)}% below the 8-week weekday average.`
      })
    }
  }

  const revenueWowPct = metrics?.week?.revenue_wow_pct
  if (isNumber(revenueWowPct) && revenueWowPct < -10) {
    alerts.push({
      severity: 'medium',
      type: 'revenue',
      title: 'Revenue trend softened week-over-week',
      detail: `Revenue is down ${Math.abs(revenueWowPct).toFixed(1)}% week-over-week.`
    })
  }

  await writeJsonFile(ALERTS_OUTPUT_PATH, alerts)
  console.log('[analytics] alerts computed', { count: alerts.length })
}

run().catch((error: unknown) => {
  console.error('[analytics] compute_alerts failed', error)
  process.exitCode = 1
})
