import { stat, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

export type AnalyticsFreshness = 'fresh' | 'stale' | 'missing'

export type AnalyticsOutputsPayload = {
  metrics: Record<string, unknown> | null
  trends: Record<string, unknown> | null
  alerts: Array<Record<string, unknown>>
  weeklyReportMd: string | null
  weeklyReportJson: Record<string, unknown> | null
  generatedAt: string | null
  freshness: AnalyticsFreshness
  missingFiles: string[]
  storage: 'supabase' | 'filesystem'
  source: string | null
}

const OUTPUTS_DIR = path.resolve(process.cwd(), 'admin/analytics/outputs')

const FILES = {
  metrics: path.join(OUTPUTS_DIR, 'metrics.json'),
  trends: path.join(OUTPUTS_DIR, 'trends.json'),
  alerts: path.join(OUTPUTS_DIR, 'alerts.json'),
  weeklyReportMd: path.join(OUTPUTS_DIR, 'weekly-report.md'),
  weeklyReportJson: path.join(OUTPUTS_DIR, 'weekly-report.json')
}

async function readJson(pathname: string) {
  try {
    const raw = await readFile(pathname, 'utf8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

async function readJsonArray(pathname: string) {
  try {
    const raw = await readFile(pathname, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : []
  } catch {
    return []
  }
}

async function readText(pathname: string) {
  try {
    return await readFile(pathname, 'utf8')
  } catch {
    return null
  }
}

async function resolveFreshness(generatedAt: string | null): Promise<AnalyticsFreshness> {
  if (!generatedAt) return 'missing'
  const generatedMs = Date.parse(generatedAt)
  if (Number.isNaN(generatedMs)) return 'stale'

  const diffMs = Date.now() - generatedMs
  const maxFreshMs = 1000 * 60 * 60 * 24 * 2
  return diffMs <= maxFreshMs ? 'fresh' : 'stale'
}

async function missing(paths: Record<string, string>) {
  const missingFiles: string[] = []

  await Promise.all(Object.entries(paths).map(async ([label, pathname]) => {
    try {
      await stat(pathname)
    } catch {
      missingFiles.push(label)
    }
  }))

  return missingFiles
}

export async function readAnalyticsOutputs(): Promise<AnalyticsOutputsPayload> {
  const [
    metrics,
    trends,
    alerts,
    weeklyReportMd,
    weeklyReportJson,
    missingFiles
  ] = await Promise.all([
    readJson(FILES.metrics),
    readJson(FILES.trends),
    readJsonArray(FILES.alerts),
    readText(FILES.weeklyReportMd),
    readJson(FILES.weeklyReportJson),
    missing(FILES)
  ])

  const generatedAt = [
    String(metrics?.generated_at ?? ''),
    String(trends?.generated_at ?? ''),
    String(weeklyReportJson?.generated_at ?? '')
  ]
    .map(value => value.trim())
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null

  return {
    metrics,
    trends,
    alerts,
    weeklyReportMd,
    weeklyReportJson,
    generatedAt,
    freshness: await resolveFreshness(generatedAt),
    missingFiles,
    storage: 'filesystem',
    source: null
  }
}

type AnalyticsDbRow = {
  generated_at: string | null
  freshness: AnalyticsFreshness | null
  source: string | null
  metrics: Record<string, unknown> | null
  trends: Record<string, unknown> | null
  alerts: Array<Record<string, unknown>> | null
  weekly_report_md: string | null
  weekly_report_json: Record<string, unknown> | null
}

async function readAnalyticsOutputsFromSupabase(event: H3Event): Promise<AnalyticsOutputsPayload | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = serverSupabaseServiceRole(event) as any

  const { data, error } = await supabase
    .from('analytics_outputs')
    .select('generated_at,freshness,source,metrics,trends,alerts,weekly_report_md,weekly_report_json')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const row = data as AnalyticsDbRow
  const generatedAt = row.generated_at ? String(row.generated_at) : null
  const freshness = row.freshness ?? await resolveFreshness(generatedAt)

  return {
    metrics: row.metrics ?? null,
    trends: row.trends ?? null,
    alerts: Array.isArray(row.alerts) ? row.alerts : [],
    weeklyReportMd: row.weekly_report_md ?? null,
    weeklyReportJson: row.weekly_report_json ?? null,
    generatedAt,
    freshness,
    missingFiles: [],
    storage: 'supabase',
    source: row.source ?? null
  }
}

export async function readAnalyticsOutputsForEvent(event: H3Event): Promise<AnalyticsOutputsPayload> {
  const fromDb = await readAnalyticsOutputsFromSupabase(event).catch(() => null)
  if (fromDb) return fromDb
  return await readAnalyticsOutputs()
}
