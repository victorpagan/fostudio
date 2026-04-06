import { RAW_ADS_PATH } from './lib/constants'
import { writeJsonFile } from './lib/fs'
import { toNumber } from './lib/parse'
import { createSupabaseClient } from './lib/supabase'
import type { IngestManifest, IngestSource, RawAdRecord } from './lib/types'

type AdRow = {
  date: string | null
  platform: string | null
  campaign: string | null
  spend: number | string | null
  clicks: number | string | null
  impressions: number | string | null
  conversions: number | string | null
}

const CANDIDATE_TABLES = [
  'analytics_ad_daily',
  'analytics_ads_daily',
  'ad_performance_daily'
] as const

function normalizePlatform(value: string | null | undefined): RawAdRecord['platform'] {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized.includes('meta') || normalized.includes('facebook') || normalized.includes('instagram')) return 'meta'
  if (normalized.includes('google')) return 'google'
  return 'other'
}

function normalizeAdRow(row: AdRow): RawAdRecord {
  return {
    date: String(row.date || new Date().toISOString()),
    platform: normalizePlatform(row.platform),
    campaign: String(row.campaign || 'unknown-campaign').trim(),
    spend: toNumber(row.spend, 0),
    clicks: toNumber(row.clicks, 0),
    impressions: toNumber(row.impressions, 0),
    conversions: toNumber(row.conversions, 0)
  }
}

async function loadFromSupabase() {
  const supabase = createSupabaseClient()
  if (!supabase) {
    return {
      source: 'unavailable' as IngestSource,
      records: [] as RawAdRecord[],
      notes: ['Supabase credentials were not found. Ads data is unavailable.']
    }
  }

  const notes: string[] = []

  for (const table of CANDIDATE_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('date,platform,campaign,spend,clicks,impressions,conversions')
      .limit(50000)

    if (error) {
      notes.push(`Table ${table} unavailable: ${error.message}`)
      continue
    }

    const rows = ((data ?? []) as AdRow[]).map(normalizeAdRow)

    return {
      source: 'supabase' as IngestSource,
      records: rows,
      notes: [`Loaded ${rows.length} ad rows from Supabase table ${table}.`]
    }
  }

  return {
    source: 'unavailable' as IngestSource,
    records: [] as RawAdRecord[],
    notes: [
      ...notes,
      'No supported Supabase ads table found. Expected one of: analytics_ad_daily, analytics_ads_daily, ad_performance_daily.'
    ]
  }
}

async function run() {
  const result = await loadFromSupabase()

  const manifest: IngestManifest = {
    generated_at: new Date().toISOString(),
    source: result.source,
    notes: result.notes
  }

  await writeJsonFile(RAW_ADS_PATH, {
    manifest,
    records: result.records
  })

  console.log(`[analytics] ads ingest complete: ${result.records.length} rows (${result.source})`)
}

run().catch((error: unknown) => {
  console.error('[analytics] ads ingest failed', error)
  process.exitCode = 1
})
