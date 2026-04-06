import {
  ALERTS_OUTPUT_PATH,
  METRICS_OUTPUT_PATH,
  TRENDS_OUTPUT_PATH,
  WEEKLY_REPORT_JSON_PATH,
  WEEKLY_REPORT_MD_PATH
} from './lib/constants'
import { readJsonFile, readTextFile } from './lib/fs'
import { createSupabaseClient } from './lib/supabase'

type PublishedPayload = {
  generated_at: string
  week_of: string | null
  freshness: 'fresh' | 'stale' | 'missing'
  metrics: Record<string, unknown> | null
  trends: Record<string, unknown> | null
  alerts: Array<Record<string, unknown>>
  weekly_report_md: string | null
  weekly_report_json: Record<string, unknown> | null
  source: string
}

function normalizeGeneratedAt(metrics: Record<string, unknown> | null, trends: Record<string, unknown> | null, weeklyReportJson: Record<string, unknown> | null) {
  const generated = [
    String(metrics?.generated_at ?? ''),
    String(trends?.generated_at ?? ''),
    String(weeklyReportJson?.generated_at ?? '')
  ]
    .map(value => value.trim())
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0]

  return generated || new Date().toISOString()
}

function normalizeWeekOf(metrics: Record<string, unknown> | null, trends: Record<string, unknown> | null, weeklyReportJson: Record<string, unknown> | null) {
  const raw = String(metrics?.week_of ?? trends?.week_of ?? weeklyReportJson?.week_of ?? '').trim()
  return raw || null
}

async function run() {
  const requireSupabase = process.env.ANALYTICS_REQUIRE_SUPABASE === '1'
    || process.argv.includes('--require-supabase')

  const supabase = createSupabaseClient()
  if (!supabase) {
    if (requireSupabase) {
      throw new Error('[analytics] Supabase required for publish step but credentials were unavailable.')
    }

    console.log('[analytics] publish skipped: Supabase credentials are unavailable.')
    return
  }

  const [
    metrics,
    trends,
    alertsRaw,
    weeklyReportMd,
    weeklyReportJson
  ] = await Promise.all([
    readJsonFile<Record<string, unknown>>(METRICS_OUTPUT_PATH),
    readJsonFile<Record<string, unknown>>(TRENDS_OUTPUT_PATH),
    readJsonFile<unknown>(ALERTS_OUTPUT_PATH),
    readTextFile(WEEKLY_REPORT_MD_PATH),
    readJsonFile<Record<string, unknown>>(WEEKLY_REPORT_JSON_PATH)
  ])

  const alerts = Array.isArray(alertsRaw)
    ? alertsRaw.filter(item => typeof item === 'object' && item !== null) as Array<Record<string, unknown>>
    : []

  const generatedAt = normalizeGeneratedAt(metrics, trends, weeklyReportJson)
  const weekOf = normalizeWeekOf(metrics, trends, weeklyReportJson)

  const payload: PublishedPayload = {
    generated_at: generatedAt,
    week_of: weekOf,
    freshness: 'fresh',
    metrics,
    trends,
    alerts,
    weekly_report_md: weeklyReportMd,
    weekly_report_json: weeklyReportJson,
    source: 'pipeline'
  }

  const { data, error } = await supabase
    .from('analytics_outputs')
    .insert(payload)
    .select('id,generated_at')
    .single()

  if (error) {
    throw new Error(`[analytics] publish failed: ${error.message}`)
  }

  console.log('[analytics] outputs published', {
    id: data?.id ?? null,
    generated_at: data?.generated_at ?? generatedAt
  })
}

run().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
