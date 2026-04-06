import { analyticsMetricDefinitions } from '../config/metric-definitions'
import {
  ALERTS_OUTPUT_PATH,
  METRICS_OUTPUT_PATH,
  TRENDS_OUTPUT_PATH,
  WEEKLY_REPORT_JSON_PATH,
  WEEKLY_REPORT_MD_PATH
} from './lib/constants'
import { readJsonFile, writeJsonFile, writeTextFile } from './lib/fs'
import type { AlertsOutputItem, MetricsOutput, TrendsOutput, WeeklyReportJson } from './lib/types'

function asPct(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function asCurrency(value: number) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function asInt(value: number) {
  return Math.round(value)
}

function buildWhatChanged(metrics: MetricsOutput, trends: TrendsOutput) {
  const items: string[] = []

  if (metrics.week.revenue_wow_pct >= 0) {
    items.push(`Revenue increased ${asPct(metrics.week.revenue_wow_pct)} week-over-week.`)
  } else {
    items.push(`Revenue declined ${asPct(metrics.week.revenue_wow_pct)} week-over-week.`)
  }

  if (metrics.week.net_members > 0) {
    items.push(`Membership growth was net +${metrics.week.net_members} this week.`)
  } else if (metrics.week.net_members < 0) {
    items.push(`Memberships net changed by ${metrics.week.net_members} this week.`)
  } else {
    items.push('Membership count was flat week-over-week.')
  }

  const utilizationSeries = trends.utilization_by_week
  if (utilizationSeries.length >= 2) {
    const latest = utilizationSeries[utilizationSeries.length - 1]?.value ?? 0
    const prior = utilizationSeries[utilizationSeries.length - 2]?.value ?? 0
    if (latest >= prior) {
      items.push('Studio utilization trend improved versus the previous week.')
    } else {
      items.push('Studio utilization softened versus the previous week.')
    }
  }

  return items.slice(0, 3)
}

function buildRecommendedActions(metrics: MetricsOutput, alerts: AlertsOutputItem[]) {
  const actions: string[] = []

  if (metrics.ads.meta.cost_per_conversion > 0 && metrics.ads.google.cost_per_conversion > 0) {
    if (metrics.ads.meta.cost_per_conversion > metrics.ads.google.cost_per_conversion * 1.5) {
      actions.push('Shift 20-30% of Meta budget to high-intent Google Search campaigns.')
    }
  }

  if (alerts.some(alert => alert.type === 'bookings' || alert.title.toLowerCase().includes('wednesday'))) {
    actions.push('Run a Wednesday fill-rate promotion with a booking deadline and reminder email.')
  }

  if (metrics.week.new_members > 0 || metrics.week.bookings_total > 0) {
    actions.push('Promote first-booker membership upgrade offer in follow-up email and Instagram stories.')
  }

  if (actions.length < 3) {
    actions.push('Send a targeted Creator-tier nurture campaign focused on underused credits and session planning.')
  }

  return actions.slice(0, 3)
}

function buildEmailRecommendations(metrics: MetricsOutput) {
  return [
    {
      campaign_name: 'First-Time Booker to Member Upgrade',
      objective: 'Convert recent guest or first-time bookings into membership signups.',
      audience: 'Guests and first-time bookers from the last 30 days.',
      subject_options: [
        'Ready to make FO Studio your weekly home?',
        'Your next session can cost less with membership',
        'Keep your momentum: member pricing inside'
      ],
      key_points: [
        'Highlight membership value against one-off booking costs.',
        'Include the active seasonal promo code and expiration date.',
        'Show one clear path to compare Creator, Pro, and Studio+ tiers.'
      ],
      cta: 'Compare memberships',
      send_window: 'Tuesday 10:00 AM America/Los_Angeles'
    },
    {
      campaign_name: 'Low-Usage Creator Re-engagement',
      objective: 'Increase booked sessions among active Creator members with low recent utilization.',
      audience: 'Active Creator members with less than 25% usage in the last 30 days.',
      subject_options: [
        'Use your studio access before this month closes',
        'A quick plan to use your Creator hours this week',
        'Book a focused session this Wednesday'
      ],
      key_points: [
        'Remind members of included access and current booking availability.',
        'Offer a Wednesday-focused nudge to improve weak-day fill rate.',
        'Use a direct booking CTA with calendar link.'
      ],
      cta: 'Book your next session',
      send_window: 'Monday 4:00 PM America/Los_Angeles'
    }
  ].map(recommendation => ({
    ...recommendation,
    objective: recommendation.objective,
    audience: recommendation.audience,
    key_points: recommendation.key_points,
    subject_options: recommendation.subject_options,
    send_window: recommendation.send_window,
    cta: recommendation.cta,
    campaign_name: recommendation.campaign_name,
    note: `Weekly active members: ${metrics.week.active_members}`
  }))
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
    revenue_by_week: [],
    members_by_week: [],
    utilization_by_week: []
  }

  const safeAlerts = alerts ?? []

  const whatChanged = buildWhatChanged(metrics, safeTrends)
  const recommendedActions = buildRecommendedActions(metrics, safeAlerts)
  const emailRecommendations = buildEmailRecommendations(metrics)

  const jsonReport: WeeklyReportJson = {
    generated_at: new Date().toISOString(),
    week_of: metrics.week_of,
    snapshot: {
      revenue: metrics.week.revenue_total,
      revenue_wow_pct: metrics.week.revenue_wow_pct,
      bookings: metrics.week.bookings_total,
      booked_hours: metrics.week.booked_hours,
      utilization_rate: metrics.week.utilization_rate,
      active_members: metrics.week.active_members,
      new_members: metrics.week.new_members,
      cancellations: metrics.week.canceled_members
    },
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
    alerts: safeAlerts.map(alert => alert.title),
    recommended_next_actions: recommendedActions,
    email_recommendations: emailRecommendations
  }

  const markdown = [
    '# FO Studio Weekly Report',
    `Week of: ${metrics.week_of}`,
    '',
    '## Snapshot',
    `- Revenue: ${asCurrency(metrics.week.revenue_total)} (${asPct(metrics.week.revenue_wow_pct)} WoW)`,
    `- Bookings: ${asInt(metrics.week.bookings_total)}`,
    `- Booked hours: ${metrics.week.booked_hours.toFixed(1)}`,
    `- Utilization: ${(metrics.week.utilization_rate * 100).toFixed(1)}%`,
    `- Active members: ${asInt(metrics.week.active_members)}`,
    `- New members: ${asInt(metrics.week.new_members)}`,
    `- Cancellations: ${asInt(metrics.week.canceled_members)}`,
    '',
    '## Memberships',
    `- ${analyticsMetricDefinitions.tierLabels.creator}: ${asInt(metrics.tiers.creator)}`,
    `- ${analyticsMetricDefinitions.tierLabels.pro}: ${asInt(metrics.tiers.pro)}`,
    `- ${analyticsMetricDefinitions.tierLabels.studio_plus}: ${asInt(metrics.tiers.studio_plus)}`,
    `- Net growth: ${metrics.week.net_members >= 0 ? '+' : ''}${asInt(metrics.week.net_members)}`,
    '',
    '## Marketing',
    `- Google Ads: ${asCurrency(metrics.ads.google.spend)} spend, ${asInt(metrics.ads.google.conversions)} conversions, ${asCurrency(metrics.ads.google.cost_per_conversion)} CPA`,
    `- Meta Ads: ${asCurrency(metrics.ads.meta.spend)} spend, ${asInt(metrics.ads.meta.conversions)} conversions, ${asCurrency(metrics.ads.meta.cost_per_conversion)} CPA`,
    '',
    '## What changed',
    ...whatChanged.map(item => `- ${item}`),
    '',
    '## Alerts',
    ...(safeAlerts.length > 0 ? safeAlerts.map(item => `- ${item.title}: ${item.detail}`) : ['- No major alerts this week.']),
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
      `- Send window: ${recommendation.send_window}`
    ])
  ].join('\n') + '\n'

  await Promise.all([
    writeJsonFile(WEEKLY_REPORT_JSON_PATH, jsonReport),
    writeTextFile(WEEKLY_REPORT_MD_PATH, markdown)
  ])

  console.log('[analytics] weekly report generated', {
    week_of: jsonReport.week_of,
    alerts: safeAlerts.length
  })
}

run().catch((error: unknown) => {
  console.error('[analytics] build_weekly_report failed', error)
  process.exitCode = 1
})
