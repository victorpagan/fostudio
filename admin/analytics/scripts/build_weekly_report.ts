import { analyticsMetricDefinitions } from '../config/metric-definitions'
import {
  ALERTS_OUTPUT_PATH,
  METRICS_OUTPUT_PATH,
  TRENDS_OUTPUT_PATH,
  WEEKLY_REPORT_JSON_PATH,
  WEEKLY_REPORT_MD_PATH
} from './lib/constants'
import { readJsonFile, writeJsonFile, writeTextFile } from './lib/fs'
import type {
  AlertsOutputItem,
  DataAvailability,
  DataQualityMetadata,
  IngestSource,
  MetricsOutput,
  TrendsOutput,
  WeeklyReportJson
} from './lib/types'

type TrendsWeekday = TrendsOutput['weekday_utilization']['weakest_day']

const QUALITY_LABEL: Record<DataQualityMetadata['confidence']['label'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function asPct(value: number | null | undefined) {
  if (!isNumber(value)) return 'Data unavailable'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function asCurrency(value: number | null | undefined) {
  if (!isNumber(value)) return 'Data unavailable'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function asInt(value: number | null | undefined) {
  if (!isNumber(value)) return 'Data unavailable'
  return String(Math.round(value))
}

function asHours(value: number | null | undefined) {
  if (!isNumber(value)) return 'Data unavailable'
  return value.toFixed(1)
}

function asUtilization(value: number | null | undefined) {
  if (!isNumber(value)) return 'Data unavailable'
  return `${(value * 100).toFixed(1)}%`
}

function isAvailable(source: IngestSource) {
  return source === 'supabase'
}

function sourceLabel(source: IngestSource) {
  return isAvailable(source) ? 'Available' : 'Data unavailable'
}

function safeOpsMetrics(metrics: MetricsOutput): MetricsOutput['ops'] {
  const ops = (metrics as Partial<MetricsOutput>).ops
  return ops ?? {
    incidents_created_week: null,
    incidents_open_count: null,
    incidents_high_severity_open_count: null,
    incidents_resolved_week: null,
    expenses_submitted_count: null,
    expenses_approved_unpaid_count: null,
    expenses_submitted_total_week: null,
    expenses_approved_total_week: null,
    expenses_paid_total_week: null
  }
}

function safeAvailability(input: DataAvailability | undefined): DataAvailability {
  return input ?? {
    memberships: 'unavailable',
    bookings: 'unavailable',
    revenue: 'unavailable',
    ops: 'unavailable',
    ads: 'unavailable',
    notes: {
      memberships: [],
      bookings: [],
      revenue: [],
      ops: [],
      ads: []
    }
  }
}

function safeDataQuality(
  metricsQuality: DataQualityMetadata | undefined,
  trendsQuality: DataQualityMetadata | undefined
): DataQualityMetadata {
  if (metricsQuality) return metricsQuality
  if (trendsQuality) return trendsQuality
  return {
    source_completeness: {
      memberships: 0,
      bookings: 0,
      revenue: 0,
      ops: 0,
      ads: 0
    },
    row_counts: {
      memberships: 0,
      membership_state: 0,
      bookings: 0,
      revenue: 0,
      incidents: 0,
      expenses: 0,
      ads: 0
    },
    exclusions_applied: {
      memberships: 0,
      membership_state: 0,
      bookings: 0,
      revenue: 0,
      incidents: 0,
      expenses: 0,
      ads: 0,
      accounts: 0
    },
    warnings: ['Data quality metadata unavailable.'],
    confidence: {
      score: 0,
      label: 'low'
    }
  }
}

function deriveWeekdayFocus(weakestDay: TrendsWeekday) {
  return {
    weakest_day: weakestDay?.weekday ?? null,
    weakest_day_bookings: isNumber(weakestDay?.bookings) ? weakestDay.bookings : null,
    weakest_day_booked_hours: isNumber(weakestDay?.booked_hours) ? weakestDay.booked_hours : null
  }
}

function buildWhatChanged(metrics: MetricsOutput, trends: TrendsOutput, dataQuality: DataQualityMetadata) {
  const items: string[] = []
  const ops = safeOpsMetrics(metrics)

  if (isNumber(metrics.week.active_members) && isNumber(metrics.week.net_members)) {
    if (metrics.week.net_members > 0) {
      items.push(`Membership base expanded to ${asInt(metrics.week.active_members)} active members (net +${asInt(metrics.week.net_members)} this week).`)
    } else if (metrics.week.net_members < 0) {
      items.push(`Membership base softened by ${asInt(Math.abs(metrics.week.net_members))} this week (${asInt(metrics.week.active_members)} active members now).`)
    } else {
      items.push(`Membership base remained stable at ${asInt(metrics.week.active_members)} active members.`)
    }
  }

  const utilizationSeries = trends.utilization_by_week
  if (utilizationSeries.length >= 2) {
    const latest = utilizationSeries[utilizationSeries.length - 1]?.value
    const prior = utilizationSeries[utilizationSeries.length - 2]?.value
    if (isNumber(latest) && isNumber(prior)) {
      const deltaPctPoints = (latest - prior) * 100
      if (deltaPctPoints >= 1) {
        items.push(`Utilization improved by ${deltaPctPoints.toFixed(1)} pts week-over-week (${(latest * 100).toFixed(1)}%).`)
      } else if (deltaPctPoints <= -1) {
        items.push(`Utilization softened by ${Math.abs(deltaPctPoints).toFixed(1)} pts week-over-week (${(latest * 100).toFixed(1)}%).`)
      } else {
        items.push(`Utilization remained flat week-over-week at ${(latest * 100).toFixed(1)}%.`)
      }
    }
  } else if (!isAvailable(metrics.data_availability.bookings)) {
    items.push('Utilization trend is unavailable because booking data is missing.')
  }

  if (
    isNumber(metrics.member_usage.members_with_zero_bookings_14d)
    && isNumber(metrics.week.active_members)
    && metrics.week.active_members > 0
  ) {
    const ratio = metrics.member_usage.members_with_zero_bookings_14d / metrics.week.active_members
    items.push(`${asInt(metrics.member_usage.members_with_zero_bookings_14d)} active members had zero bookings in the last 14 days (${(ratio * 100).toFixed(0)}%).`)
  }

  const weakestDay = trends.weekday_utilization.weakest_day
  if (weakestDay) {
    items.push(`${weakestDay.weekday} remains the weakest day (${asInt(weakestDay.bookings)} bookings, ${asHours(weakestDay.booked_hours)} hours in lookback window).`)
  }

  if (!isAvailable(metrics.data_availability.ads)) {
    items.push('Paid-channel insights are incomplete because ads data is currently unavailable.')
  }

  if (isNumber(ops.incidents_open_count) && ops.incidents_open_count > 0) {
    items.push(`${asInt(ops.incidents_open_count)} admin incidents remain open or investigating.`)
  }

  if (isNumber(ops.expenses_approved_unpaid_count) && ops.expenses_approved_unpaid_count > 0) {
    items.push(`${asInt(ops.expenses_approved_unpaid_count)} approved expenses are waiting for payout.`)
  }

  if (dataQuality.confidence.score < 0.75) {
    items.push(`Analytics confidence is ${QUALITY_LABEL[dataQuality.confidence.label].toLowerCase()} (${(dataQuality.confidence.score * 100).toFixed(0)}%), so conclusions are directional.`)
  }

  if (
    isNumber(metrics.week.cash_received)
    && isNumber(metrics.week.recognized_revenue_total)
    && Math.abs(metrics.week.cash_received - metrics.week.recognized_revenue_total) > 0
  ) {
    const gap = Math.abs(metrics.week.cash_received - metrics.week.recognized_revenue_total)
    if (gap >= Math.max(200, Math.abs(metrics.week.recognized_revenue_total) * 0.25)) {
      items.push('Cash timing differed from recognized revenue this week, so operational utilization and member activity were weighted more heavily than cash swings.')
    }
  }

  if (items.length === 0) {
    items.push('Core operational metrics were stable this week with no major directional change detected.')
  }

  return items.slice(0, 5)
}

function buildRecommendedActions(
  metrics: MetricsOutput,
  trends: TrendsOutput,
  alerts: AlertsOutputItem[],
  dataQuality: DataQualityMetadata
) {
  const actions: string[] = []
  const ops = safeOpsMetrics(metrics)

  const weakest = trends.weekday_utilization.weakest_day
  if (weakest?.weekday) {
    actions.push(`Run a ${weakest.weekday} fill-rate push with a 48-hour booking incentive and one reminder email.`)
  }

  if (
    isNumber(metrics.member_usage.members_with_zero_bookings_14d)
    && isNumber(metrics.week.active_members)
    && metrics.week.active_members > 0
  ) {
    const ratio = metrics.member_usage.members_with_zero_bookings_14d / metrics.week.active_members
    if (ratio >= 0.3) {
      actions.push('Launch a low-usage member reactivation sequence with one-click booking links and tier-specific usage reminders.')
    }
  }

  if (isNumber(metrics.cohorts.repeat_guests_not_converted) && metrics.cohorts.repeat_guests_not_converted > 0) {
    actions.push('Target repeat guests who have not converted with a first-month membership offer and conversion-focused follow-up.')
  }

  if (!isAvailable(metrics.data_availability.ads)) {
    actions.push('Finish ads data integration so paid-channel spend and CPA recommendations are based on live platform data.')
  } else {
    const metaCpa = metrics.ads.meta?.cost_per_conversion
    const googleCpa = metrics.ads.google?.cost_per_conversion
    if (isNumber(metaCpa) && isNumber(googleCpa) && metaCpa > 0 && googleCpa > 0 && metaCpa > googleCpa * 1.5) {
      actions.push('Shift 20-30% of Meta budget toward Google Search until CPA converges across channels.')
    }
  }

  if (alerts.some(alert => alert.type === 'bookings' && alert.severity !== 'low')) {
    actions.push('Publish a short weekly inventory calendar across Instagram and email to stabilize booking volume.')
  }

  if (dataQuality.confidence.score < 0.7) {
    actions.push('Resolve missing data sources and account classification gaps before making major budget changes.')
  }

  if (actions.length < 3) {
    actions.push('Promote a member-only midweek offer and track incremental booked hours week-over-week.')
  }

  if (isNumber(ops.expenses_submitted_count) && ops.expenses_submitted_count > 0) {
    actions.push('Run a twice-weekly finance approval pass so submitted expenses do not age into payout risk.')
  }

  return [...new Set(actions)].slice(0, 3)
}

function buildEmailRecommendations(
  metrics: MetricsOutput,
  trends: TrendsOutput,
  dataQuality: DataQualityMetadata
): WeeklyReportJson['email_recommendations'] {
  const weakest = trends.weekday_utilization.weakest_day?.weekday ?? 'Wednesday'
  const activeMembersLabel = isNumber(metrics.week.active_members)
    ? String(metrics.week.active_members)
    : 'Data unavailable'

  const recommendations: WeeklyReportJson['email_recommendations'] = [
    {
      campaign_name: 'Low-Usage Member Reactivation',
      objective: 'Increase near-term bookings among active members with recent inactivity.',
      audience: 'Active members with zero bookings in the last 14 days.',
      subject_options: [
        'Use your studio access this week',
        'A quick way to book your next FO session',
        'Your included studio hours are waiting'
      ],
      key_points: [
        'Highlight remaining included value this month.',
        `Prioritize ${weakest} slots to improve fill rate.`,
        'Use a direct calendar deep-link CTA.'
      ],
      cta: 'Book your next session',
      send_window: 'Monday 4:00 PM America/Los_Angeles'
    },
    {
      campaign_name: 'Repeat Guest Conversion',
      objective: 'Convert repeat non-member guests into paid memberships.',
      audience: 'Guests with 2+ bookings who are not currently converted to membership.',
      subject_options: [
        'You are booking often. Membership now saves you more.',
        'Make your next session member-priced',
        'Your FO routine deserves member rates'
      ],
      key_points: [
        'Compare one-time spend vs membership value.',
        'Include Creator, Pro, and Studio+ ladder with clear differences.',
        'Show a one-week conversion incentive window.'
      ],
      cta: 'Compare membership options',
      send_window: 'Tuesday 10:00 AM America/Los_Angeles'
    },
    {
      campaign_name: `${weakest} Fill-Rate Boost`,
      objective: `Increase booked hours on ${weakest}, currently the lowest-demand day.`,
      audience: `Recent bookers and active members who can schedule on ${weakest}.`,
      subject_options: [
        `${weakest} studio slots are open this week`,
        `Claim a ${weakest} session before spots close`,
        `Best availability is ${weakest} this week`
      ],
      key_points: [
        'Lead with strongest available time windows.',
        'Offer a limited-time incentive tied to that day.',
        'Follow with a final reminder 24 hours before close.'
      ],
      cta: `Book a ${weakest} session`,
      send_window: 'Sunday 6:00 PM America/Los_Angeles'
    }
  ]

  const note = `Weekly active members: ${activeMembersLabel}. Analytics confidence: ${QUALITY_LABEL[dataQuality.confidence.label]} (${(dataQuality.confidence.score * 100).toFixed(0)}%).`
  return recommendations.map(item => ({ ...item, note }))
}

function availabilityNotes(availability: DataAvailability) {
  const lines: string[] = []
  for (const key of ['memberships', 'bookings', 'revenue', 'ops', 'ads'] as const) {
    for (const note of availability.notes[key] ?? []) {
      lines.push(`${key}: ${note}`)
    }
  }
  return lines
}

async function run() {
  const [metrics, trends, alerts] = await Promise.all([
    readJsonFile<MetricsOutput>(METRICS_OUTPUT_PATH),
    readJsonFile<TrendsOutput>(TRENDS_OUTPUT_PATH),
    readJsonFile<AlertsOutputItem[]>(ALERTS_OUTPUT_PATH)
  ])

  if (!metrics) {
    throw new Error('metrics.json is missing. Run analytics:compute first.')
  }

  const safeTrends: TrendsOutput = trends ?? {
    generated_at: new Date().toISOString(),
    week_of: metrics.week_of,
    data_availability: metrics.data_availability,
    data_quality: metrics.data_quality,
    revenue_by_week: [],
    cash_received_by_week: [],
    recognized_revenue_by_week: [],
    one_time_booking_revenue_by_week: [],
    members_by_week: [],
    utilization_by_week: [],
    incidents_created_by_week: [],
    incidents_open_by_week: [],
    expenses_submitted_by_week: [],
    expenses_paid_by_week: [],
    booking_mix_by_week: [],
    weekday_utilization: {
      lookback_weeks: analyticsMetricDefinitions.weekdayLookbackWeeks,
      bookings_by_weekday: [],
      booked_hours_by_weekday: [],
      weakest_day: null
    },
    cohort_conversion: {
      repeat_guests_not_converted: 0,
      converted_guest_members: 0,
      avg_guest_to_member_lag_days: null,
      median_guest_to_member_lag_days: null,
      records: []
    }
  }

  const safeAlerts = alerts ?? []
  const availability = safeAvailability(metrics.data_availability)
  const dataQuality = safeDataQuality(metrics.data_quality, safeTrends.data_quality)
  const ops = safeOpsMetrics(metrics)

  const whatChanged = buildWhatChanged(metrics, safeTrends, dataQuality)
  const recommendedActions = buildRecommendedActions(metrics, safeTrends, safeAlerts, dataQuality)
  const emailRecommendations = buildEmailRecommendations(metrics, safeTrends, dataQuality)
  const weekdayFocus = deriveWeekdayFocus(safeTrends.weekday_utilization.weakest_day)

  const jsonReport: WeeklyReportJson = {
    generated_at: new Date().toISOString(),
    week_of: metrics.week_of,
    data_availability: availability,
    data_quality: dataQuality,
    snapshot: {
      revenue: metrics.week.revenue_total,
      revenue_wow_pct: metrics.week.revenue_wow_pct,
      cash_received: metrics.week.cash_received,
      cash_received_wow_pct: metrics.week.cash_received_wow_pct,
      recognized_revenue: metrics.week.recognized_revenue_total,
      recognized_revenue_wow_pct: metrics.week.recognized_revenue_wow_pct,
      one_time_booking_revenue: metrics.week.one_time_booking_revenue,
      bookings: metrics.week.bookings_total,
      booked_hours: metrics.week.booked_hours,
      utilization_rate: metrics.week.utilization_rate,
      active_members: metrics.week.active_members,
      new_members: metrics.week.new_members,
      cancellations: metrics.week.canceled_members
    },
    member_usage: metrics.member_usage,
    booking_segmentation: metrics.booking_segmentation,
    cohorts: metrics.cohorts,
    ops,
    weekday_focus: weekdayFocus,
    memberships: {
      creator: metrics.tiers.creator,
      pro: metrics.tiers.pro,
      studio_plus: metrics.tiers.studio_plus,
      net_growth: metrics.week.net_members
    },
    marketing: {
      google_ads: metrics.ads.google,
      meta_ads: metrics.ads.meta
    },
    what_changed: whatChanged,
    alerts: safeAlerts.map(alert => `${alert.title}: ${alert.detail}`),
    recommended_next_actions: recommendedActions,
    email_recommendations: emailRecommendations
  }

  const googleAdsLine = metrics.ads.google
    ? `${asCurrency(metrics.ads.google.spend)} spend, ${asInt(metrics.ads.google.conversions)} conversions, ${asCurrency(metrics.ads.google.cost_per_conversion)} CPA`
    : 'Data unavailable.'

  const metaAdsLine = metrics.ads.meta
    ? `${asCurrency(metrics.ads.meta.spend)} spend, ${asInt(metrics.ads.meta.conversions)} conversions, ${asCurrency(metrics.ads.meta.cost_per_conversion)} CPA`
    : 'Data unavailable.'

  const qualityWarnings = [
    ...dataQuality.warnings,
    ...availabilityNotes(availability)
  ]

  const markdown = [
    '# FO Studio Weekly Report',
    `Week of: ${metrics.week_of}`,
    '',
    '## Snapshot',
    `- Recognized revenue: ${asCurrency(metrics.week.recognized_revenue_total)} (${asPct(metrics.week.recognized_revenue_wow_pct)} WoW)`,
    `- Cash received: ${asCurrency(metrics.week.cash_received)} (${asPct(metrics.week.cash_received_wow_pct)} WoW)`,
    `- One-time booking revenue: ${asCurrency(metrics.week.one_time_booking_revenue)}`,
    `- Bookings: ${asInt(metrics.week.bookings_total)}`,
    `- Booked hours: ${asHours(metrics.week.booked_hours)}`,
    `- Utilization: ${asUtilization(metrics.week.utilization_rate)}`,
    `- Active members: ${asInt(metrics.week.active_members)}`,
    `- New members: ${asInt(metrics.week.new_members)}`,
    `- Cancellations: ${asInt(metrics.week.canceled_members)}`,
    '',
    '## Memberships',
    `- ${analyticsMetricDefinitions.tierLabels.creator}: ${asInt(metrics.tiers.creator)}`,
    `- ${analyticsMetricDefinitions.tierLabels.pro}: ${asInt(metrics.tiers.pro)}`,
    `- ${analyticsMetricDefinitions.tierLabels.studio_plus}: ${asInt(metrics.tiers.studio_plus)}`,
    `- Net growth: ${isNumber(metrics.week.net_members) ? `${metrics.week.net_members >= 0 ? '+' : ''}${asInt(metrics.week.net_members)}` : 'Data unavailable'}`,
    '',
    '## Usage and Conversion',
    `- Bookings/member (7d): ${asHours(metrics.member_usage.bookings_per_member_7d)}`,
    `- Bookings/member (30d): ${asHours(metrics.member_usage.bookings_per_member_30d)}`,
    `- Booked hours/member (30d): ${asHours(metrics.member_usage.booked_hours_per_member_30d)}`,
    `- Members with 0 bookings (14d): ${asInt(metrics.member_usage.members_with_zero_bookings_14d)}`,
    `- Members with 0 bookings (30d): ${asInt(metrics.member_usage.members_with_zero_bookings_30d)}`,
    `- Repeat guests not converted: ${asInt(metrics.cohorts.repeat_guests_not_converted)}`,
    `- Avg guest-to-member lag: ${isNumber(metrics.cohorts.avg_guest_to_member_lag_days) ? `${metrics.cohorts.avg_guest_to_member_lag_days.toFixed(1)} days` : 'Data unavailable'}`,
    '',
    '## Booking Mix',
    `- Member bookings: ${asInt(metrics.booking_segmentation.member.bookings)} (${asHours(metrics.booking_segmentation.member.booked_hours)} hrs, ${asCurrency(metrics.booking_segmentation.member.revenue)})`,
    `- Non-member bookings: ${asInt(metrics.booking_segmentation.non_member.bookings)} (${asHours(metrics.booking_segmentation.non_member.booked_hours)} hrs, ${asCurrency(metrics.booking_segmentation.non_member.revenue)})`,
    `- Weakest day: ${weekdayFocus.weakest_day ?? 'Data unavailable'}${isNumber(weekdayFocus.weakest_day_bookings) ? ` (${asInt(weekdayFocus.weakest_day_bookings)} bookings)` : ''}`,
    '',
    '## Ops Workflow',
    `- Incidents created this week: ${asInt(ops.incidents_created_week)}`,
    `- Open incidents: ${asInt(ops.incidents_open_count)} (high severity ${asInt(ops.incidents_high_severity_open_count)})`,
    `- Incidents resolved this week: ${asInt(ops.incidents_resolved_week)}`,
    `- Submitted expenses (current): ${asInt(ops.expenses_submitted_count)} (${asCurrency(ops.expenses_submitted_total_week)} submitted this week)`,
    `- Approved unpaid expenses (current): ${asInt(ops.expenses_approved_unpaid_count)} (${asCurrency(ops.expenses_approved_total_week)} approved this week)`,
    `- Paid expenses this week: ${asCurrency(ops.expenses_paid_total_week)}`,
    '',
    '## Marketing',
    `- Google Ads: ${googleAdsLine}`,
    `- Meta Ads: ${metaAdsLine}`,
    '',
    '## Data Quality',
    `- Confidence: ${QUALITY_LABEL[dataQuality.confidence.label]} (${(dataQuality.confidence.score * 100).toFixed(0)}%)`,
    `- Source completeness: memberships ${Math.round(dataQuality.source_completeness.memberships * 100)}%, bookings ${Math.round(dataQuality.source_completeness.bookings * 100)}%, revenue ${Math.round(dataQuality.source_completeness.revenue * 100)}%, ops ${Math.round(dataQuality.source_completeness.ops * 100)}%, ads ${Math.round(dataQuality.source_completeness.ads * 100)}%`,
    `- Exclusions applied: memberships ${asInt(dataQuality.exclusions_applied.memberships)}, bookings ${asInt(dataQuality.exclusions_applied.bookings)}, revenue ${asInt(dataQuality.exclusions_applied.revenue)}, accounts ${asInt(dataQuality.exclusions_applied.accounts)}`,
    ...(
      qualityWarnings.length
        ? qualityWarnings.map(item => `- Warning: ${item}`)
        : ['- Warning: none']
    ),
    '',
    '## Data availability',
    `- Memberships: ${sourceLabel(availability.memberships)}`,
    `- Bookings: ${sourceLabel(availability.bookings)}`,
    `- Revenue: ${sourceLabel(availability.revenue)}`,
    `- Ops: ${sourceLabel(availability.ops)}`,
    `- Ads: ${sourceLabel(availability.ads)}`,
    '',
    '## What changed',
    ...whatChanged.map(item => `- ${item}`),
    '',
    '## Alerts',
    ...(safeAlerts.length > 0 ? safeAlerts.map(item => `- [${item.severity.toUpperCase()}] ${item.title}: ${item.detail}`) : ['- No major alerts this week.']),
    '',
    '## Recommended next actions',
    ...recommendedActions.map((item, idx) => `${idx + 1}. ${item}`),
    '',
    '## Email campaign recommendations',
    ...emailRecommendations.flatMap((recommendation, idx) => [
      `${idx + 1}. ${recommendation.campaign_name}`,
      `- Objective: ${recommendation.objective}`,
      `- Audience: ${recommendation.audience}`,
      `- CTA: ${recommendation.cta}`,
      `- Send window: ${recommendation.send_window}`,
      recommendation.note ? `- Note: ${recommendation.note}` : null
    ].filter(Boolean) as string[])
  ].join('\n') + '\n'

  await Promise.all([
    writeJsonFile(WEEKLY_REPORT_JSON_PATH, jsonReport),
    writeTextFile(WEEKLY_REPORT_MD_PATH, markdown)
  ])

  console.log('[analytics] weekly report generated', {
    week_of: jsonReport.week_of,
    alerts: safeAlerts.length,
    confidence: dataQuality.confidence.score,
    ads_available: availability.ads === 'supabase'
  })
}

run().catch((error: unknown) => {
  console.error('[analytics] build_weekly_report failed', error)
  process.exitCode = 1
})
