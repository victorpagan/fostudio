import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { loadAdminMemberOptions } from '~~/server/utils/admin/memberOptions'

const INCIDENT_CATEGORIES = ['safety', 'facility', 'equipment', 'access', 'billing', 'member', 'policy', 'other'] as const
const INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
const INCIDENT_STATUSES = ['open', 'investigating', 'resolved', 'closed'] as const

const querySchema = z.object({
  search: z.string().trim().max(200).optional().default(''),
  status: z.enum(INCIDENT_STATUSES).optional(),
  category: z.enum(INCIDENT_CATEGORIES).optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  memberUserId: z.string().uuid().optional()
})

type IncidentRow = {
  id: string
  title: string
  description: string | null
  category: typeof INCIDENT_CATEGORIES[number]
  severity: typeof INCIDENT_SEVERITIES[number]
  status: typeof INCIDENT_STATUSES[number]
  member_user_id: string | null
  occurred_at: string | null
  resolved_at: string | null
  resolved_by: string | null
  closed_at: string | null
  closed_by: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

type ExpenseRollupRow = {
  incident_id: string | null
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid'
  amount_cents: number
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const query = querySchema.parse(getQuery(event))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [incidentsRes, expenseRollupRes, memberOptions] = await Promise.all([
    db
      .from('admin_incident_reports')
      .select('id,title,description,category,severity,status,member_user_id,occurred_at,resolved_at,resolved_by,closed_at,closed_by,created_by,updated_by,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(600),
    db
      .from('admin_expense_reports')
      .select('incident_id,status,amount_cents')
      .not('incident_id', 'is', null)
      .limit(1200),
    loadAdminMemberOptions(event)
  ])

  if (incidentsRes.error) {
    throw createError({ statusCode: 500, statusMessage: incidentsRes.error.message })
  }

  if (expenseRollupRes.error) {
    throw createError({ statusCode: 500, statusMessage: expenseRollupRes.error.message })
  }

  const incidents = (incidentsRes.data ?? []) as IncidentRow[]
  const search = query.search.trim().toLowerCase()

  const filteredIncidents = incidents.filter((row) => {
    if (query.status && row.status !== query.status) return false
    if (query.category && row.category !== query.category) return false
    if (query.severity && row.severity !== query.severity) return false
    if (query.memberUserId && row.member_user_id !== query.memberUserId) return false
    if (!search) return true

    const memberOption = memberOptions.find(option => option.userId === row.member_user_id)
    const text = [
      row.title,
      row.description,
      row.category,
      row.severity,
      row.status,
      row.member_user_id,
      memberOption?.name,
      memberOption?.email,
      memberOption?.label
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return text.includes(search)
  })

  const rollupsByIncident = new Map<string, {
    linkedExpenseCount: number
    linkedExpenseTotalCents: number
    draftExpenseCount: number
    submittedExpenseCount: number
    approvedExpenseCount: number
    rejectedExpenseCount: number
    paidExpenseCount: number
  }>()

  for (const row of (expenseRollupRes.data ?? []) as ExpenseRollupRow[]) {
    const incidentId = String(row.incident_id ?? '').trim()
    if (!incidentId) continue

    const existing = rollupsByIncident.get(incidentId) ?? {
      linkedExpenseCount: 0,
      linkedExpenseTotalCents: 0,
      draftExpenseCount: 0,
      submittedExpenseCount: 0,
      approvedExpenseCount: 0,
      rejectedExpenseCount: 0,
      paidExpenseCount: 0
    }

    existing.linkedExpenseCount += 1
    existing.linkedExpenseTotalCents += Math.max(0, Number(row.amount_cents ?? 0))

    if (row.status === 'draft') existing.draftExpenseCount += 1
    else if (row.status === 'submitted') existing.submittedExpenseCount += 1
    else if (row.status === 'approved') existing.approvedExpenseCount += 1
    else if (row.status === 'rejected') existing.rejectedExpenseCount += 1
    else if (row.status === 'paid') existing.paidExpenseCount += 1

    rollupsByIncident.set(incidentId, existing)
  }

  const memberLabelByUser = new Map(memberOptions.map(option => [option.userId, option.label] as const))

  const rows = filteredIncidents.map((row) => {
    const rollup = rollupsByIncident.get(row.id) ?? {
      linkedExpenseCount: 0,
      linkedExpenseTotalCents: 0,
      draftExpenseCount: 0,
      submittedExpenseCount: 0,
      approvedExpenseCount: 0,
      rejectedExpenseCount: 0,
      paidExpenseCount: 0
    }

    return {
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      category: row.category,
      severity: row.severity,
      status: row.status,
      memberUserId: row.member_user_id,
      memberLabel: row.member_user_id ? (memberLabelByUser.get(row.member_user_id) ?? row.member_user_id) : null,
      occurredAt: row.occurred_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      closedAt: row.closed_at,
      closedBy: row.closed_by,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      relatedExpenses: rollup
    }
  })

  const summary = {
    totalCount: rows.length,
    openCount: rows.filter(row => row.status === 'open').length,
    investigatingCount: rows.filter(row => row.status === 'investigating').length,
    resolvedCount: rows.filter(row => row.status === 'resolved').length,
    closedCount: rows.filter(row => row.status === 'closed').length,
    highSeverityOpenCount: rows.filter(row => row.status !== 'closed' && (row.severity === 'high' || row.severity === 'critical')).length,
    linkedExpenseCount: rows.reduce((sum, row) => sum + row.relatedExpenses.linkedExpenseCount, 0),
    linkedExpenseTotalCents: rows.reduce((sum, row) => sum + row.relatedExpenses.linkedExpenseTotalCents, 0)
  }

  return {
    incidents: rows,
    summary,
    memberOptions
  }
})
