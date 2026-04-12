import { analyticsAlertThresholds } from '../config/alert-thresholds'
import { DateTime } from 'luxon'
import {
  ALERTS_OUTPUT_PATH,
  METRICS_OUTPUT_PATH,
  TRENDS_OUTPUT_PATH
} from './lib/constants'
import { readJsonFile, writeJsonFile } from './lib/fs'
import {
  adsInRange,
  aggregateAds,
  bookingsInRange,
  getWeekContext,
  kpiEligibleRows,
  loadAnalyticsData,
  parseWeekOfArg
} from './lib/analytics'
import type {
  AlertsOutputItem,
  DataAvailability,
  IngestSource,
  MetricsOutput,
  TrendsOutput
} from './lib/types'

type AvailabilityKey = 'memberships' | 'bookings' | 'revenue' | 'ops' | 'ads'

const severityOrder: Record<AlertsOutputItem['severity'], number> = {
  low: 1,
  medium: 2,
  high: 3
}

function isAvailable(source: IngestSource) {
  return source === 'supabase'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function downgradeSeverity(
  severity: AlertsOutputItem['severity'],
  level: 'none' | 'light' | 'strong'
): AlertsOutputItem['severity'] {
  if (level === 'none') return severity
  if (level === 'strong') return 'low'
  if (severity === 'high') return 'medium'
  if (severity === 'medium') return 'low'
  return 'low'
}

function addUnavailableAlert(
  alerts: AlertsOutputItem[],
  availability: DataAvailability,
  key: AvailabilityKey,
  title: string,
  detailPrefix: string
) {
  const source = availability[key] as IngestSource
  if (isAvailable(source)) return

  const note = availability.notes[key]?.[0]
  alerts.push({
    severity: key === 'ads' ? 'low' : 'medium',
    type: 'data',
    title,
    detail: note ? `${detailPrefix} ${note}` : detailPrefix
  })
}

function withSeverityAdjustments(
  alerts: AlertsOutputItem[],
  level: 'none' | 'light' | 'strong'
) {
  if (level === 'none') return alerts
  return alerts.map((alert) => {
    if (alert.type === 'data') return alert
    return {
      ...alert,
      severity: downgradeSeverity(alert.severity, level)
    }
  })
}

async function run() {
  const weekOf = parseWeekOfArg()
  const context = getWeekContext(weekOf)
  const data = await loadAnalyticsData()
  const kpiBookings = kpiEligibleRows(data.bookings)

  const [metrics, trends] = await Promise.all([
    readJsonFile<MetricsOutput>(METRICS_OUTPUT_PATH),
    readJsonFile<TrendsOutput>(TRENDS_OUTPUT_PATH)
  ])

  const availability = metrics?.data_availability ?? data.availability
  const confidenceScore = Number(metrics?.data_quality?.confidence?.score ?? data.data_quality.confidence.score ?? 0)
  const exclusionTotals = metrics?.data_quality?.exclusions_applied ?? data.data_quality.exclusions_applied
  const rowCounts = metrics?.data_quality?.row_counts ?? data.data_quality.row_counts

  const excludedRows = Number(exclusionTotals.memberships ?? 0) + Number(exclusionTotals.bookings ?? 0) + Number(exclusionTotals.revenue ?? 0)
  const totalRows = Math.max(1, Number(rowCounts.memberships ?? 0) + Number(rowCounts.bookings ?? 0) + Number(rowCounts.revenue ?? 0))
  const noisyRatio = excludedRows / totalRows
  const isNoisyPeriod = noisyRatio >= analyticsAlertThresholds.dataQuality.noisyExclusionRatio

  let downgradeLevel: 'none' | 'light' | 'strong' = 'none'
  if (confidenceScore < analyticsAlertThresholds.dataQuality.minConfidenceForRevenueAlerts || isNoisyPeriod) {
    downgradeLevel = 'light'
  }
  if (confidenceScore < 0.45) {
    downgradeLevel = 'strong'
  }

  const alerts: AlertsOutputItem[] = []

  addUnavailableAlert(
    alerts,
    availability,
    'ops',
    'Ops data unavailable',
    'Incident and expense workflow data is unavailable, so operations alerting is incomplete.'
  )
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
    'Membership data is unavailable, so retention/churn activity alerts may be incomplete.'
  )
  addUnavailableAlert(
    alerts,
    availability,
    'revenue',
    'Revenue data unavailable',
    'Revenue model data is unavailable, so revenue alerts are suppressed.'
  )

  if (confidenceScore < 0.6) {
    alerts.push({
      severity: 'low',
      type: 'data',
      title: 'Analytics confidence is reduced',
      detail: `Current confidence score is ${(confidenceScore * 100).toFixed(0)}%, so non-critical alerts are downgraded.`
    })
  }

  if (isNoisyPeriod) {
    alerts.push({
      severity: 'low',
      type: 'data',
      title: 'Noisy migration/exclusion period detected',
      detail: `${(noisyRatio * 100).toFixed(1)}% of KPI candidate rows were excluded; trend alerts are partially suppressed to avoid false positives.`
    })
  }

  if (isAvailable(availability.bookings)) {
    const currentBookings = bookingsInRange(kpiBookings, context.start, context.end).filter(item => item.status !== 'canceled')
    const previousBookings = bookingsInRange(kpiBookings, context.previous_start, context.previous_end).filter(item => item.status !== 'canceled')
    const currentHours = currentBookings.reduce((sum, row) => sum + Number(row.hours ?? 0), 0)
    const previousHours = previousBookings.reduce((sum, row) => sum + Number(row.hours ?? 0), 0)

    if (previousBookings.length > 0) {
      const dropRatio = (previousBookings.length - currentBookings.length) / previousBookings.length
      if (dropRatio >= analyticsAlertThresholds.bookings.wowDropPct) {
        alerts.push({
          severity: dropRatio > 0.35 ? 'high' : 'medium',
          type: 'bookings',
          title: 'Bookings down week-over-week',
          detail: `Bookings fell by ${(dropRatio * 100).toFixed(1)}% compared with last week (${currentBookings.length} vs ${previousBookings.length}).`
        })
      }
    }

    if (previousHours > 0) {
      const hoursDropRatio = (previousHours - currentHours) / previousHours
      if (hoursDropRatio >= analyticsAlertThresholds.utilization.wowDropPct) {
        alerts.push({
          severity: 'medium',
          type: 'bookings',
          title: 'Booked hours softened week-over-week',
          detail: `Booked hours are down ${(hoursDropRatio * 100).toFixed(1)}% week-over-week (${currentHours.toFixed(1)}h vs ${previousHours.toFixed(1)}h).`
        })
      }
    }
  }

  const utilizationRate = metrics?.week?.utilization_rate
  if (isNumber(utilizationRate) && utilizationRate < analyticsAlertThresholds.utilization.lowWeeklyUtilizationRatio) {
    alerts.push({
      severity: 'medium',
      type: 'bookings',
      title: 'Utilization is running below target',
      detail: `Weekly utilization is ${(utilizationRate * 100).toFixed(1)}%, below the ${(analyticsAlertThresholds.utilization.lowWeeklyUtilizationRatio * 100).toFixed(0)}% threshold.`
    })
  }

  if (isAvailable(availability.memberships) && metrics?.member_usage) {
    const activeMembers = Number(metrics.week?.active_members ?? 0)
    const zero14 = Number(metrics.member_usage.members_with_zero_bookings_14d ?? 0)
    const zero30 = Number(metrics.member_usage.members_with_zero_bookings_30d ?? 0)

    if (activeMembers >= analyticsAlertThresholds.memberActivity.minActiveMembers) {
      const zero14Ratio = activeMembers > 0 ? zero14 / activeMembers : 0
      const zero30Ratio = activeMembers > 0 ? zero30 / activeMembers : 0

      if (zero14Ratio >= analyticsAlertThresholds.memberActivity.zeroBooking14dWarnRatio) {
        alerts.push({
          severity: 'high',
          type: 'retention',
          title: 'Member activity dropped in the last 14 days',
          detail: `${zero14} of ${activeMembers} active members recorded zero bookings in the last 14 days.`
        })
      } else if (zero30Ratio >= analyticsAlertThresholds.memberActivity.zeroBooking30dWarnRatio) {
        alerts.push({
          severity: 'medium',
          type: 'retention',
          title: 'Member activity is soft over 30 days',
          detail: `${zero30} of ${activeMembers} active members recorded zero bookings in the last 30 days.`
        })
      }
    }
  }

  const weakestDay = trends?.weekday_utilization?.weakest_day
  if (weakestDay && weakestDay.bookings >= 0 && weakestDay.booked_hours >= 0) {
    alerts.push({
      severity: 'low',
      type: 'channel',
      title: `${weakestDay.weekday} remains the weakest booking day`,
      detail: `${weakestDay.weekday} logged ${weakestDay.bookings} bookings and ${Number(weakestDay.booked_hours).toFixed(1)} booked hours in the recent weekday lookback window.`
    })
  }

  if (isAvailable(availability.ads)) {
    const adWindowStart = context.end.minus({ days: analyticsAlertThresholds.adPerformance.cpaComparisonWindowDays - 1 }).startOf('day')
    const adRows = adsInRange(data.ads, adWindowStart, context.end)
    const adSummary = aggregateAds(adRows)

    if (
      adSummary.meta.spend >= analyticsAlertThresholds.adPerformance.weakChannelMinSpend
      && adSummary.meta.conversions <= analyticsAlertThresholds.adPerformance.weakChannelMinConversions
    ) {
      alerts.push({
        severity: 'medium',
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

  if (isAvailable(availability.revenue) && metrics?.week) {
    const recognizedWow = metrics.week.recognized_revenue_wow_pct
    const cash = Number(metrics.week.cash_received ?? 0)
    const recognized = Number(metrics.week.recognized_revenue_total ?? 0)
    const lumpyGap = Math.abs(cash - recognized) / Math.max(1, Math.abs(recognized))

    if (lumpyGap >= analyticsAlertThresholds.revenue.lumpyGapRatio) {
      alerts.push({
        severity: 'low',
        type: 'data',
        title: 'Revenue timing variance detected',
        detail: `Cash and recognized revenue differ by ${(lumpyGap * 100).toFixed(1)}% this week; revenue swing alerts are softened to avoid timing noise.`
      })
    } else if (
      isNumber(recognizedWow)
      && recognizedWow <= -(analyticsAlertThresholds.revenue.wowDropPct * 100)
      && confidenceScore >= analyticsAlertThresholds.dataQuality.minConfidenceForRevenueAlerts
    ) {
      alerts.push({
        severity: 'low',
        type: 'revenue',
        title: 'Recognized revenue softened week-over-week',
        detail: `Recognized revenue is down ${Math.abs(recognizedWow).toFixed(1)}% week-over-week.`
      })
    }
  }

  if (isAvailable(availability.ops) && metrics?.ops) {
    const highSeverityOpen = Number(metrics.ops.incidents_high_severity_open_count ?? 0)
    if (highSeverityOpen >= analyticsAlertThresholds.ops.highSeverityOpenIncidentWarnCount) {
      alerts.push({
        severity: 'high',
        type: 'ops',
        title: 'High-severity incidents are open',
        detail: `${highSeverityOpen} high/critical incidents are currently open or investigating.`
      })
    }

    const now = DateTime.now()
    const staleSubmittedCount = data.expenses.filter((row) => {
      if (row.status !== 'submitted' || !row.submitted_at) return false
      const submitted = DateTime.fromISO(row.submitted_at)
      if (!submitted.isValid) return false
      return now.diff(submitted, 'days').days >= analyticsAlertThresholds.ops.staleSubmittedExpenseDays
    }).length

    if (staleSubmittedCount > 0) {
      alerts.push({
        severity: 'medium',
        type: 'ops',
        title: 'Submitted expenses pending too long',
        detail: `${staleSubmittedCount} submitted expense reports are older than ${analyticsAlertThresholds.ops.staleSubmittedExpenseDays} days.`
      })
    }

    const staleApprovedCount = data.expenses.filter((row) => {
      if (row.status !== 'approved' || !row.approved_at) return false
      const approved = DateTime.fromISO(row.approved_at)
      if (!approved.isValid) return false
      return now.diff(approved, 'days').days >= analyticsAlertThresholds.ops.staleApprovedExpenseDays
    }).length

    if (staleApprovedCount > 0) {
      alerts.push({
        severity: 'medium',
        type: 'ops',
        title: 'Approved expenses waiting for payout',
        detail: `${staleApprovedCount} approved expenses are older than ${analyticsAlertThresholds.ops.staleApprovedExpenseDays} days without payout.`
      })
    }
  }

  const adjustedAlerts = withSeverityAdjustments(alerts, downgradeLevel)
    .sort((left, right) => severityOrder[right.severity] - severityOrder[left.severity])

  await writeJsonFile(ALERTS_OUTPUT_PATH, adjustedAlerts)
  console.log('[analytics] alerts computed', {
    count: adjustedAlerts.length,
    confidence: confidenceScore,
    noisy_period: isNoisyPeriod,
    downgraded: downgradeLevel !== 'none'
  })
}

run().catch((error: unknown) => {
  console.error('[analytics] compute_alerts failed', error)
  process.exitCode = 1
})
