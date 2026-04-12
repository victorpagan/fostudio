import { RAW_OPS_PATH } from './lib/constants'
import { writeJsonFile } from './lib/fs'
import { createSupabaseClient } from './lib/supabase'
import type { IngestManifest, IngestSource, RawExpenseRecord, RawIncidentRecord } from './lib/types'

type IncidentRow = {
  id: string
  title: string
  category: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'investigating' | 'resolved' | 'closed'
  member_user_id: string | null
  occurred_at: string | null
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

type ExpenseRow = {
  id: string
  title: string
  category: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid'
  amount_cents: number
  currency: string
  incident_id: string | null
  member_user_id: string | null
  incurred_on: string | null
  submitted_at: string | null
  approved_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

async function loadFromSupabase() {
  const supabase = createSupabaseClient()
  if (!supabase) {
    return {
      source: 'unavailable' as IngestSource,
      incidents: [] as RawIncidentRecord[],
      expenses: [] as RawExpenseRecord[],
      notes: ['Supabase credentials were not found. Ops incident and expense data are unavailable.']
    }
  }

  const [incidentsRes, expensesRes] = await Promise.all([
    supabase
      .from('admin_incident_reports')
      .select('id,title,category,severity,status,member_user_id,occurred_at,resolved_at,closed_at,created_at,updated_at')
      .limit(12000),
    supabase
      .from('admin_expense_reports')
      .select('id,title,category,status,amount_cents,currency,incident_id,member_user_id,incurred_on,submitted_at,approved_at,paid_at,created_at,updated_at')
      .limit(12000)
  ])

  const failed = [incidentsRes.error, expensesRes.error].filter(Boolean)
  if (failed.length) {
    return {
      source: 'unavailable' as IngestSource,
      incidents: [] as RawIncidentRecord[],
      expenses: [] as RawExpenseRecord[],
      notes: [`Supabase ops query failed: ${failed[0]?.message ?? 'unknown error'}`]
    }
  }

  const incidents = ((incidentsRes.data ?? []) as IncidentRow[]).map(row => ({
    incident_id: String(row.id),
    title: String(row.title ?? ''),
    category: String(row.category ?? 'other'),
    severity: row.severity,
    status: row.status,
    member_user_id: row.member_user_id,
    occurred_at: row.occurred_at,
    resolved_at: row.resolved_at,
    closed_at: row.closed_at,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  }))

  const expenses = ((expensesRes.data ?? []) as ExpenseRow[]).map(row => ({
    expense_id: String(row.id),
    title: String(row.title ?? ''),
    category: String(row.category ?? 'other'),
    status: row.status,
    amount_cents: Math.max(0, Number(row.amount_cents ?? 0)),
    currency: String(row.currency ?? 'USD'),
    incident_id: row.incident_id,
    member_user_id: row.member_user_id,
    incurred_on: row.incurred_on,
    submitted_at: row.submitted_at,
    approved_at: row.approved_at,
    paid_at: row.paid_at,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  }))

  return {
    source: 'supabase' as IngestSource,
    incidents,
    expenses,
    notes: [
      `Loaded ${incidents.length} admin incidents from Supabase.`,
      `Loaded ${expenses.length} admin expenses from Supabase.`
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

  await writeJsonFile(RAW_OPS_PATH, {
    manifest,
    incidents: result.incidents,
    expenses: result.expenses
  })

  console.log(`[analytics] ops ingest complete: ${result.incidents.length} incidents, ${result.expenses.length} expenses (${result.source})`)
}

run().catch((error: unknown) => {
  console.error('[analytics] ops ingest failed', error)
  process.exitCode = 1
})
