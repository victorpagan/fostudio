import { RAW_MEMBERSHIPS_PATH } from './lib/constants'
import { writeJsonFile } from './lib/fs'
import { toStringOrNull } from './lib/parse'
import { createSupabaseClient } from './lib/supabase'
import type { IngestManifest, IngestSource, RawMembershipRecord } from './lib/types'
import {
  buildCustomerLookup,
  fetchCustomerClassificationRows,
  resolveAccountClassification
} from './lib/accountFlags'

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

function normalizeMembershipFromDb(
  row: MembershipRow,
  pricingMap: Map<string, number>,
  customerLookup: ReturnType<typeof buildCustomerLookup>
): RawMembershipRecord {
  const tier = String(row.tier ?? '').trim().toLowerCase() || 'other'
  const cadence = toStringOrNull(row.cadence)?.toLowerCase() ?? null
  const priceKey = `${tier}:${cadence ?? ''}`
  const account = resolveAccountClassification({
    customerId: row.customer_id,
    userId: row.user_id
  }, customerLookup)

  return {
    membership_id: String(row.id),
    user_id: String(row.user_id),
    customer_id: toStringOrNull(row.customer_id),
    account_email: account.account_email,
    tier,
    cadence,
    status: String(row.status ?? '').trim().toLowerCase() || 'active',
    amount: pricingMap.get(priceKey) ?? 0,
    created_at: String(row.created_at),
    canceled_at: toStringOrNull(row.canceled_at),
    current_period_start: toStringOrNull(row.current_period_start),
    current_period_end: toStringOrNull(row.current_period_end),
    last_paid_at: toStringOrNull(row.last_paid_at),
    is_test_account: account.is_test_account,
    is_internal_account: account.is_internal_account,
    exclude_from_kpis: account.exclude_from_kpis,
    expires_at: account.expires_at
  }
}

async function loadFromSupabase() {
  const supabase = createSupabaseClient()
  if (!supabase) {
    return {
      source: 'unavailable' as IngestSource,
      records: [] as RawMembershipRecord[],
      notes: ['Supabase credentials were not found. Membership data is unavailable.']
    }
  }

  const [membershipRes, variationRes, customersRes] = await Promise.all([
    supabase
      .from('memberships')
      .select('id,user_id,customer_id,tier,cadence,status,created_at,canceled_at,current_period_start,current_period_end,last_paid_at')
      .limit(5000),
    supabase
      .from('membership_plan_variations')
      .select('tier_id,cadence,price_cents')
      .order('sort_order', { ascending: true }),
    fetchCustomerClassificationRows(supabase).catch(() => [])
  ])

  if (membershipRes.error) {
    return {
      source: 'unavailable' as IngestSource,
      records: [] as RawMembershipRecord[],
      notes: [`Supabase memberships query failed: ${membershipRes.error.message}`]
    }
  }

  if (variationRes.error) {
    return {
      source: 'unavailable' as IngestSource,
      records: [] as RawMembershipRecord[],
      notes: [`Supabase variation query failed: ${variationRes.error.message}`]
    }
  }

  const pricingMap = toPricingMap((variationRes.data ?? []) as VariationRow[])
  const customerLookup = buildCustomerLookup(customersRes)
  const records = ((membershipRes.data ?? []) as MembershipRow[])
    .map(row => normalizeMembershipFromDb(row, pricingMap, customerLookup))

  const excludedCount = records.filter(row => row.exclude_from_kpis).length

  return {
    source: 'supabase' as IngestSource,
    records,
    notes: [
      `Loaded ${records.length} membership rows from Supabase.`,
      `Loaded ${customersRes.length} customer classification rows from Supabase.`,
      `Excluded ${excludedCount} membership rows from KPI computations due to account classification.`
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

  await writeJsonFile(RAW_MEMBERSHIPS_PATH, {
    manifest,
    records: result.records
  })

  console.log(`[analytics] memberships ingest complete: ${result.records.length} rows (${result.source})`)
}

run().catch((error: unknown) => {
  console.error('[analytics] memberships ingest failed', error)
  process.exitCode = 1
})
