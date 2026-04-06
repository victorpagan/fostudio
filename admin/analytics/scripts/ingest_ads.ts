import {
  INPUT_ADS_GOOGLE_CSV_PATH,
  INPUT_ADS_META_CSV_PATH,
  RAW_ADS_PATH
} from './lib/constants'
import { readCsv } from './lib/csv'
import { writeJsonFile } from './lib/fs'
import { toNumber } from './lib/parse'
import type { IngestManifest, RawAdRecord } from './lib/types'

function normalizeAdRow(row: Record<string, string>, platform: RawAdRecord['platform']): RawAdRecord {
  return {
    date: String(row.date || new Date().toISOString()),
    platform,
    campaign: String(row.campaign || row.campaign_name || 'unknown-campaign').trim(),
    spend: toNumber(row.spend, 0),
    clicks: toNumber(row.clicks, 0),
    impressions: toNumber(row.impressions, 0),
    conversions: toNumber(row.conversions, 0)
  }
}

async function run() {
  const [metaRows, googleRows] = await Promise.all([
    readCsv(INPUT_ADS_META_CSV_PATH),
    readCsv(INPUT_ADS_GOOGLE_CSV_PATH)
  ])

  const records: RawAdRecord[] = [
    ...metaRows.map(row => normalizeAdRow(row, 'meta')),
    ...googleRows.map(row => normalizeAdRow(row, 'google'))
  ]

  const manifest: IngestManifest = {
    generated_at: new Date().toISOString(),
    source: 'csv',
    notes: [
      `Loaded ${metaRows.length} Meta ad rows from ${INPUT_ADS_META_CSV_PATH}.`,
      `Loaded ${googleRows.length} Google ad rows from ${INPUT_ADS_GOOGLE_CSV_PATH}.`
    ]
  }

  await writeJsonFile(RAW_ADS_PATH, {
    manifest,
    records
  })

  console.log(`[analytics] ads ingest complete: ${records.length} rows (csv)`)
}

run().catch((error: unknown) => {
  console.error('[analytics] ads ingest failed', error)
  process.exitCode = 1
})
