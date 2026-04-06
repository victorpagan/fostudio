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

type SystemConfigRow = {
  key: string
  value: unknown
}

type AdsSyncStatusProvider = {
  platform?: string
  enabled?: boolean
  ok?: boolean
  skippedReason?: string | null
}

type AdsSyncStatus = {
  ok?: boolean
  sync_enabled?: boolean
  providers?: AdsSyncStatusProvider[]
}

const CANDIDATE_TABLES = [
  'analytics_ad_daily',
  'analytics_ads_daily',
  'ad_performance_daily'
] as const

const ADS_SETTINGS_KEYS = [
  'analytics_ads_sync_enabled',
  'analytics_ads_google_enabled',
  'analytics_ads_meta_enabled',
  'analytics_ads_last_sync_status'
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

function asBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return fallback
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function mapConfigRows(rows: SystemConfigRow[]) {
  return new Map(rows.map(row => [row.key, row.value] as const))
}

function readSyncStatus(value: unknown): AdsSyncStatus | null {
  if (!value || typeof value !== 'object') return null
  return value as AdsSyncStatus
}

function hasSuccessfulProviderSync(status: AdsSyncStatus | null) {
  if (!status || !Array.isArray(status.providers)) return false
  return status.providers.some(provider =>
    Boolean(provider?.enabled)
    && provider?.ok === true
    && !provider?.skippedReason
  )
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
  const settingsRes = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', [...ADS_SETTINGS_KEYS])

  if (settingsRes.error) {
    notes.push(`Could not read analytics ads settings: ${settingsRes.error.message}`)
  }

  const configMap = mapConfigRows((settingsRes.data ?? []) as SystemConfigRow[])
  const globalEnabled = asBoolean(configMap.get('analytics_ads_sync_enabled'), false)
  const googleEnabled = asBoolean(configMap.get('analytics_ads_google_enabled'), false)
  const metaEnabled = asBoolean(configMap.get('analytics_ads_meta_enabled'), false)
  const anyProviderEnabled = googleEnabled || metaEnabled

  if (!globalEnabled || !anyProviderEnabled) {
    return {
      source: 'unavailable' as IngestSource,
      records: [] as RawAdRecord[],
      notes: [
        ...notes,
        'Ads source is unavailable because analytics ads sync is disabled or no ad platform is enabled.'
      ]
    }
  }

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
    const status = readSyncStatus(configMap.get('analytics_ads_last_sync_status'))

    if (rows.length === 0 && !hasSuccessfulProviderSync(status)) {
      return {
        source: 'unavailable' as IngestSource,
        records: [] as RawAdRecord[],
        notes: [
          ...notes,
          `Table ${table} returned 0 rows and no successful provider sync was recorded.`
        ]
      }
    }

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
