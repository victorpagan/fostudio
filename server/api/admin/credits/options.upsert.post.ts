import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(120),
  description: z.string().max(255).optional().nullable(),
  credits: z.number().positive(),
  basePriceCents: z.number().int().positive(),
  salePriceCents: z.number().int().positive().optional().nullable(),
  saleStartsAt: z.string().datetime().optional().nullable(),
  saleEndsAt: z.string().datetime().optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  metadata: z.record(z.string(), z.any()).optional().nullable()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const path = firstIssue?.path?.join('.') || 'request'
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid ${path}: ${firstIssue?.message ?? 'invalid value'}`
    })
  }
  const body = parsed.data

  if (body.salePriceCents !== null && body.salePriceCents !== undefined && body.salePriceCents > body.basePriceCents) {
    throw createError({ statusCode: 400, statusMessage: 'Sale price must be less than or equal to base price.' })
  }

  if (body.saleStartsAt && body.saleEndsAt && new Date(body.saleEndsAt) <= new Date(body.saleStartsAt)) {
    throw createError({ statusCode: 400, statusMessage: 'Sale end must be later than sale start.' })
  }

  const payload = {
    key: body.key,
    label: body.label,
    description: body.description ?? null,
    credits: body.credits,
    base_price_cents: body.basePriceCents,
    sale_price_cents: body.salePriceCents ?? null,
    sale_starts_at: body.saleStartsAt ?? null,
    sale_ends_at: body.saleEndsAt ?? null,
    active: body.active,
    sort_order: body.sortOrder,
    metadata: body.metadata ?? null
  }

  if (body.id) {
    const { data, error } = await db
      .from('credit_pricing_options')
      .update(payload)
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    return { option: data }
  }

  const { data, error } = await db
    .from('credit_pricing_options')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { option: data }
})
