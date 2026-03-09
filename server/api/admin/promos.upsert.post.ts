import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(2).max(64),
  description: z.string().max(240).optional().nullable(),
  discountType: z.enum(['percent', 'fixed_cents']),
  discountValue: z.number().positive(),
  appliesTo: z.enum(['all', 'membership', 'credits']).default('all'),
  appliesTierIds: z.array(z.string().min(1)).optional().default([]),
  active: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  maxRedemptions: z.number().int().min(0).optional().nullable()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))

  if (body.startsAt && body.endsAt && new Date(body.endsAt) <= new Date(body.startsAt)) {
    throw createError({ statusCode: 400, statusMessage: 'Promo end date must be after start date.' })
  }

  if (body.discountType === 'percent' && body.discountValue > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Percent discount cannot exceed 100.' })
  }

  // UI enters fixed discounts as dollars; persist in cents for existing schema compatibility.
  const normalizedDiscountValue = body.discountType === 'fixed_cents'
    ? Math.round(body.discountValue * 100)
    : body.discountValue

  const payload = {
    code: body.code.trim().toUpperCase(),
    description: body.description ?? null,
    discount_type: body.discountType,
    discount_value: normalizedDiscountValue,
    applies_to: body.appliesTo,
    metadata: {
      applies_tier_ids: body.appliesTierIds
    },
    active: body.active,
    starts_at: body.startsAt ?? null,
    ends_at: body.endsAt ?? null,
    max_redemptions: body.maxRedemptions ?? null
  }

  if (body.id) {
    const { data, error } = await db
      .from('promo_codes')
      .update(payload)
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    return { promo: data }
  }

  const { data, error } = await db
    .from('promo_codes')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { promo: data }
})
