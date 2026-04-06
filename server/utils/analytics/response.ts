import type { AnalyticsOutputsPayload } from './outputs'
import type { AnalyticsRunScope } from './run'

const ARTIFACT_MAP = {
  metrics: 'metrics.json',
  trends: 'trends.json',
  alerts: 'alerts.json',
  weeklyReportMd: 'weekly-report.md',
  weeklyReportJson: 'weekly-report.json'
} as const

type SummaryPayload = {
  revenue_total: number
  new_members: number
  active_members: number
}

function asNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function buildAnalyticsArtifactList(outputs: Pick<AnalyticsOutputsPayload, 'missingFiles'>) {
  const missing = new Set(outputs.missingFiles)
  return Object.entries(ARTIFACT_MAP)
    .filter(([label]) => !missing.has(label))
    .map(([, filename]) => filename)
}

export function buildAnalyticsSummary(metrics: Record<string, unknown> | null): SummaryPayload {
  const week = (metrics?.week && typeof metrics.week === 'object')
    ? metrics.week as Record<string, unknown>
    : {}

  return {
    revenue_total: asNumber(week.revenue_total),
    new_members: asNumber(week.new_members),
    active_members: asNumber(week.active_members)
  }
}

export function buildAnalyticsRunEnvelope(scope: AnalyticsRunScope, outputs: AnalyticsOutputsPayload) {
  return {
    scope,
    generatedAt: outputs.generatedAt,
    artifacts: buildAnalyticsArtifactList(outputs),
    summary: buildAnalyticsSummary(outputs.metrics)
  }
}
