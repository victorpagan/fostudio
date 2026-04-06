import {
  INPUT_MEMBERSHIPS_CSV_PATH,
  RAW_MEMBERSHIPS_PATH
} from './lib/constants'
import { readCsv } from './lib/csv'
import { writeJsonFile } from './lib/fs'
import { toNumber, toStringOrNull } from './lib/parse'
import { createSupabaseClient } from './lib/supabase'
import type { IngestManifest, RawMembershipRecord } from './lib/types'

type MembershipRow = {
  id: string
  user_id: string
  customer_id: string | null
  tier: string
  cadence: string | null
  status: string
  created_at: string
  canceled_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  last_paid_at: string | null
}

type VariationRow = {
  tier_id: string
  cadence: string | null
  price_cents: number
}

function toPricingMap(rows: VariationRow[]) {
  const map = new Map<string, number>()

  for (const row of rows) {
    const tier = String(row.tier_id ?? '').trim().toLowerCase()
    const cadence = String(row.cadence ?? '').trim().toLowerCase()
    const key = `${tier}:${cadence}`
    if (!map.has(key)) {
      map.set(key, Math.max(0, Number(row.price_cents ?? 0) / 100))
    }
  }

  return map
}

function normalizeMembershipFromDb(row: MembershipRow, pricingMap: Map<string, number>): RawMembershipRecord {
  const tier = String(row.tier ?? '').trim().toLowerCase() || 'other'
  const cadence = toStringOrNull(row.cadence)?.toLowerCase() ?? null
  const priceKey = `${tier}:${cadence ?? ''}`

  return {
    membership_id: String(row.id),
    user_id: String(row.user_id),
    customer_id: toStringOrNull(row.customer_id),
    tier,
    cadence,
    status: String(row.status ?? '').trim().toLowerCase() || 'active',
    amount: pricingMap.get(priceKey) ?? 0,
    created_at: String(row.created_at),
    canceled_at: toStringOrNull(row.canceled_at),
    current_period_start: toStringOrNull(row.current_period_start),
    current_period_end: toStringOrNull(row.current_period_end),
    last_paid_at: toStringOrNull(row.last_paid_at)
  }
}

function normalizeMembershipFromCsv(row: Record<string, string>, idx: number): RawMembershipRecord {
  const tier = String(row.tier ?? '').trim().toLowerCase() || 'other'
  const cadence = toStringOrNull(row.cadence)?.toLowerCase() ?? null
  const createdAt = String(
    row.created_at
    || row.date
    || row.start_date
    || new Date().toISOString()
  )

  return {
    membership_id: String(row.membership_id || `csv-membership-${idx + 1}`).trim(),
    user_id: String(row.user_id || row.customer_id || `csv-user-${idx + 1}`).trim(),
    customer_id: toStringOrNull(row.customer_id || row.user_id || `csv-user-${idx + 1}`),
    tier,
    cadence,
    status: String(row.status ?? 'active').trim().toLowerCase(),
    amount: toNumber(row.amount, 0),
    created_at: createdAt,
    canceled_at: toStringOrNull(row.canceled_at),
    current_period_start: toStringOrNull(row.current_period_start),
    current_period_end: toStringOrNull(row.current_period_end),
    last_paid_at: toStringOrNull(row.last_paid_at)
  }
}

async function loadFromSupabase() {
  const supabase = createSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      records: [] as RawMembershipRecord[],
      notes: ['Supabase credentials were not found; CSV fallback will be used.']
    }
  }

  const [membershipRes, variationRes] = await Promise.all([
    supabase
      .from('memberships')
      .select('id,user_id,customer_id,tier,cadence,status,created_at,canceled_at,current_period_start,current_period_end,last_paid_at')
      .limit(5000),
    supabase
      .from('membership_plan_variations')
      .select('tier_id,cadence,price_cents')
      .order('sort_order', { ascending: true })
  ])

  if (membershipRes.error) {
    return {
      ok: false,
      records: [] as RawMembershipRecord[],
      notes: [`Supabase memberships query failed: ${membershipRes.error.message}`]
    }
  }

  if (variationRes.error) {
    return {
      ok: false,
      records: [] as RawMembershipRecord[],
      notes: [`Supabase variation query failed: ${variationRes.error.message}`]
    }
  }

  const pricingMap = toPricingMap((variationRes.data ?? []) as VariationRow[])
  const records = ((membershipRes.data ?? []) as MembershipRow[])
    .map(row => normalizeMembershipFromDb(row, pricingMap))

  return {
    ok: true,
    records,
    notes: [`Loaded ${records.length} membership rows from Supabase.`]
  }
}

async function loadFromCsv() {
  const rows = await readCsv(INPUT_MEMBERSHIPS_CSV_PATH)
  const records = rows.map((row, idx) => normalizeMembershipFromCsv(row, idx))
  return {
    records,
    notes: [`Loaded ${records.length} membership rows from CSV (${INPUT_MEMBERSHIPS_CSV_PATH}).`]
  }
}

async function run() {
  const requireSupabase = process.env.ANALYTICS_REQUIRE_SUPABASE === '1'
    || process.argv.includes('--require-supabase')

  const supabaseResult = await loadFromSupabase()
  const useCsvFallback = !supabaseResult.ok
  if (requireSupabase && useCsvFallback) {
    throw new Error(`[analytics] Supabase required for memberships ingest but unavailable. ${supabaseResult.notes.join(' ')}`)
  }

  const csvResult = useCsvFallback ? await loadFromCsv() : { records: [] as RawMembershipRecord[], notes: [] as string[] }

  const source = useCsvFallback ? 'csv' : 'supabase'
  const records = useCsvFallback ? csvResult.records : supabaseResult.records

  const manifest: IngestManifest = {
    generated_at: new Date().toISOString(),
    source,
    notes: [...supabaseResult.notes, ...csvResult.notes]
  }

  await writeJsonFile(RAW_MEMBERSHIPS_PATH, {
    manifest,
    records
  })

  console.log(`[analytics] memberships ingest complete: ${records.length} rows (${source})`)
}

run().catch((error: unknown) => {
  console.error('[analytics] memberships ingest failed', error)
  process.exitCode = 1
})
