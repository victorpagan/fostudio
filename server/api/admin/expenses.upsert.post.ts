import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const EXPENSE_CATEGORIES = ['supplies', 'maintenance', 'contractor', 'utilities', 'software', 'refund', 'travel', 'other'] as const
const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'paid'] as const

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(160),
  description: z.string().max(10000).default(''),
  category: z.enum(EXPENSE_CATEGORIES),
  amountCents: z.number().int().min(0).max(10_000_000),
  currency: z.literal('USD').default('USD'),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  vendorName: z.string().max(200).default(''),
  receiptUrls: z.array(z.string().url().max(2000)).max(20).default([]),
  memberUserId: z.string().uuid().nullable().optional(),
  incidentId: z.string().uuid().nullable().optional(),
  status: z.enum(EXPENSE_STATUSES).default('draft')
})

function normalizeDescription(value: string) {
  return value.trim()
}

function normalizeVendor(value: string) {
  return value.trim()
}

function normalizeReceiptUrls(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  if (body.incidentId) {
    const { data: incident, error: incidentError } = await db
      .from('admin_incident_reports')
      .select('id')
      .eq('id', body.incidentId)
      .maybeSingle()

    if (incidentError) throw createError({ statusCode: 500, statusMessage: incidentError.message })
    if (!incident) throw createError({ statusCode: 400, statusMessage: 'Linked incident report was not found.' })
  }

  const payload = {
    title: body.title.trim(),
    description: normalizeDescription(body.description),
    category: body.category,
    amount_cents: body.amountCents,
    currency: body.currency,
    incurred_on: body.incurredOn ?? null,
    vendor_name: normalizeVendor(body.vendorName),
    receipt_urls: normalizeReceiptUrls(body.receiptUrls),
    member_user_id: body.memberUserId ?? null,
    incident_id: body.incidentId ?? null,
    updated_by: user.sub ?? null
  } satisfies Record<string, unknown>

  if (body.id) {
    const { data, error } = await db
      .from('admin_expense_reports')
      .update(payload)
      .eq('id', body.id)
      .select('id,title,description,category,status,amount_cents,currency,incurred_on,vendor_name,receipt_urls,member_user_id,incident_id,submitted_at,submitted_by,approved_at,approved_by,rejected_at,rejected_by,rejection_reason,paid_at,paid_by,payment_reference,created_by,updated_by,created_at,updated_at')
      .maybeSingle()

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data) throw createError({ statusCode: 404, statusMessage: 'Expense report not found.' })
    return { expense: data }
  }

  const { data, error } = await db
    .from('admin_expense_reports')
    .insert([{
      ...payload,
      status: body.status,
      created_by: user.sub ?? null
    }])
    .select('id,title,description,category,status,amount_cents,currency,incurred_on,vendor_name,receipt_urls,member_user_id,incident_id,submitted_at,submitted_by,approved_at,approved_by,rejected_at,rejected_by,rejection_reason,paid_at,paid_by,payment_reference,created_by,updated_by,created_at,updated_at')
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { expense: data }
})
