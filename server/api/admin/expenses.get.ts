import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { loadAdminMemberOptions } from '~~/server/utils/admin/memberOptions'

const EXPENSE_CATEGORIES = ['supplies', 'maintenance', 'contractor', 'utilities', 'software', 'refund', 'travel', 'other'] as const
const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'paid'] as const

const querySchema = z.object({
  search: z.string().trim().max(200).optional().default(''),
  status: z.enum(EXPENSE_STATUSES).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  incidentId: z.string().uuid().optional(),
  memberUserId: z.string().uuid().optional()
})

type ExpenseRow = {
  id: string
  title: string
  description: string | null
  category: typeof EXPENSE_CATEGORIES[number]
  status: typeof EXPENSE_STATUSES[number]
  amount_cents: number
  currency: string
  incurred_on: string | null
  vendor_name: string | null
  receipt_urls: string[] | null
  member_user_id: string | null
  incident_id: string | null
  submitted_at: string | null
  submitted_by: string | null
  approved_at: string | null
  approved_by: string | null
  rejected_at: string | null
  rejected_by: string | null
  rejection_reason: string | null
  paid_at: string | null
  paid_by: string | null
  payment_reference: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

type IncidentOptionRow = {
  id: string
  title: string
  status: string
  severity: string
  occurred_at: string | null
  updated_at: string
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const query = querySchema.parse(getQuery(event))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [expensesRes, incidentsRes, memberOptions] = await Promise.all([
    db
      .from('admin_expense_reports')
      .select('id,title,description,category,status,amount_cents,currency,incurred_on,vendor_name,receipt_urls,member_user_id,incident_id,submitted_at,submitted_by,approved_at,approved_by,rejected_at,rejected_by,rejection_reason,paid_at,paid_by,payment_reference,created_by,updated_by,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(800),
    db
      .from('admin_incident_reports')
      .select('id,title,status,severity,occurred_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(400),
    loadAdminMemberOptions(event)
  ])

  if (expensesRes.error) throw createError({ statusCode: 500, statusMessage: expensesRes.error.message })
  if (incidentsRes.error) throw createError({ statusCode: 500, statusMessage: incidentsRes.error.message })

  const expenses = (expensesRes.data ?? []) as ExpenseRow[]
  const incidents = (incidentsRes.data ?? []) as IncidentOptionRow[]
  const incidentById = new Map(incidents.map(row => [row.id, row] as const))
  const memberByUserId = new Map(memberOptions.map(option => [option.userId, option] as const))

  const search = query.search.trim().toLowerCase()

  const filtered = expenses.filter((row) => {
    if (query.status && row.status !== query.status) return false
    if (query.category && row.category !== query.category) return false
    if (query.incidentId && row.incident_id !== query.incidentId) return false
    if (query.memberUserId && row.member_user_id !== query.memberUserId) return false
    if (!search) return true

    const incident = row.incident_id ? incidentById.get(row.incident_id) : null
    const member = row.member_user_id ? memberByUserId.get(row.member_user_id) : null
    const text = [
      row.title,
      row.description,
      row.vendor_name,
      row.status,
      row.category,
      row.incident_id,
      incident?.title,
      row.member_user_id,
      member?.label,
      member?.email,
      ...(Array.isArray(row.receipt_urls) ? row.receipt_urls : [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return text.includes(search)
  })

  const rows = filtered.map((row) => {
    const incident = row.incident_id ? incidentById.get(row.incident_id) : null
    const member = row.member_user_id ? memberByUserId.get(row.member_user_id) : null

    return {
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      category: row.category,
      status: row.status,
      amountCents: Math.max(0, Number(row.amount_cents ?? 0)),
      currency: row.currency,
      incurredOn: row.incurred_on,
      vendorName: row.vendor_name ?? '',
      receiptUrls: Array.isArray(row.receipt_urls) ? row.receipt_urls.filter(value => typeof value === 'string' && value.trim().length > 0) : [],
      memberUserId: row.member_user_id,
      memberLabel: member?.label ?? row.member_user_id ?? null,
      incidentId: row.incident_id,
      incidentTitle: incident?.title ?? null,
      incidentSeverity: incident?.severity ?? null,
      incidentStatus: incident?.status ?? null,
      submittedAt: row.submitted_at,
      submittedBy: row.submitted_by,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by,
      rejectedAt: row.rejected_at,
      rejectedBy: row.rejected_by,
      rejectionReason: row.rejection_reason,
      paidAt: row.paid_at,
      paidBy: row.paid_by,
      paymentReference: row.payment_reference,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  })

  const summary = {
    totalCount: rows.length,
    draftCount: rows.filter(row => row.status === 'draft').length,
    submittedCount: rows.filter(row => row.status === 'submitted').length,
    approvedCount: rows.filter(row => row.status === 'approved').length,
    rejectedCount: rows.filter(row => row.status === 'rejected').length,
    paidCount: rows.filter(row => row.status === 'paid').length,
    totalAmountCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    submittedAmountCents: rows.filter(row => row.status === 'submitted').reduce((sum, row) => sum + row.amountCents, 0),
    approvedAmountCents: rows.filter(row => row.status === 'approved').reduce((sum, row) => sum + row.amountCents, 0),
    paidAmountCents: rows.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountCents, 0)
  }

  const incidentOptions = incidents.map(row => ({
    id: row.id,
    title: row.title,
    status: row.status,
    severity: row.severity,
    occurredAt: row.occurred_at,
    updatedAt: row.updated_at
  }))

  return {
    expenses: rows,
    summary,
    memberOptions,
    incidentOptions
  }
})
