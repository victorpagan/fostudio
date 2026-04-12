import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'paid'] as const

type ExpenseStatus = typeof EXPENSE_STATUSES[number]

const bodySchema = z.object({
  id: z.string().uuid(),
  status: z.enum(EXPENSE_STATUSES),
  rejectionReason: z.string().trim().max(1200).nullable().optional(),
  paymentReference: z.string().trim().max(240).nullable().optional()
})

const allowedTransitions: Record<ExpenseStatus, ExpenseStatus[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['paid', 'rejected'],
  rejected: ['draft', 'submitted'],
  paid: []
}

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: existing, error: existingError } = await db
    .from('admin_expense_reports')
    .select('id,status')
    .eq('id', body.id)
    .maybeSingle()

  if (existingError) throw createError({ statusCode: 500, statusMessage: existingError.message })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Expense report not found.' })

  const currentStatus = String(existing.status ?? '') as ExpenseStatus
  if (!allowedTransitions[currentStatus]?.includes(body.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid expense transition: ${currentStatus} -> ${body.status}`
    })
  }

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: body.status,
    updated_by: user.sub ?? null
  }

  if (body.status === 'draft') {
    patch.submitted_at = null
    patch.submitted_by = null
    patch.approved_at = null
    patch.approved_by = null
    patch.rejected_at = null
    patch.rejected_by = null
    patch.rejection_reason = null
    patch.paid_at = null
    patch.paid_by = null
    patch.payment_reference = null
  } else if (body.status === 'submitted') {
    patch.submitted_at = nowIso
    patch.submitted_by = user.sub ?? null
    patch.approved_at = null
    patch.approved_by = null
    patch.rejected_at = null
    patch.rejected_by = null
    patch.rejection_reason = null
    patch.paid_at = null
    patch.paid_by = null
    patch.payment_reference = null
  } else if (body.status === 'approved') {
    patch.approved_at = nowIso
    patch.approved_by = user.sub ?? null
    patch.rejected_at = null
    patch.rejected_by = null
    patch.rejection_reason = null
    patch.paid_at = null
    patch.paid_by = null
    patch.payment_reference = null
  } else if (body.status === 'rejected') {
    patch.rejected_at = nowIso
    patch.rejected_by = user.sub ?? null
    patch.rejection_reason = body.rejectionReason?.trim() || null
    patch.paid_at = null
    patch.paid_by = null
    patch.payment_reference = null
  } else if (body.status === 'paid') {
    patch.paid_at = nowIso
    patch.paid_by = user.sub ?? null
    patch.payment_reference = body.paymentReference?.trim() || null
  }

  const { data, error } = await db
    .from('admin_expense_reports')
    .update(patch)
    .eq('id', body.id)
    .select('id,title,description,category,status,amount_cents,currency,incurred_on,vendor_name,receipt_urls,member_user_id,incident_id,submitted_at,submitted_by,approved_at,approved_by,rejected_at,rejected_by,rejection_reason,paid_at,paid_by,payment_reference,created_by,updated_by,created_at,updated_at')
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Expense report not found.' })

  return { expense: data }
})
