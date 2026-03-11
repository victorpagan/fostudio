import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(2).max(64),
  description: z.string().max(240).optional().nullable(),
  discountType: z.enum(['percent', 'fixed_cents']),
  discountValue: z.number().positive(),
  appliesTo: z.enum(['all', 'membership', 'credits', 'holds']).default('all'),
  appliesTierIds: z.array(z.string().min(1)).optional().default([]),
  active: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  maxRedemptions: z.number().int().min(0).optional().nullable()
})

type PromoExistingRow = {
  id: string
  metadata: Record<string, unknown> | null
  square_discount_id: string | null
}

function extractSquareErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (!error || typeof error !== 'object') return 'Square sync failed'
  const details = (error as { errors?: unknown }).errors
  if (!Array.isArray(details) || details.length === 0) return 'Square sync failed'
  const first = details[0]
  if (!first || typeof first !== 'object') return 'Square sync failed'
  const detail = (first as { detail?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  const code = (first as { code?: unknown }).code
  if (typeof code === 'string' && code.trim()) return code.trim()
  return 'Square sync failed'
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(2)).toString()
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))
  const square = await useSquareClient(event)

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

  let existing: PromoExistingRow | null = null
  if (body.id) {
    const { data: existingRow, error: existingErr } = await db
      .from('promo_codes')
      .select('id,metadata,square_discount_id')
      .eq('id', body.id)
      .maybeSingle()

    if (existingErr) throw createError({ statusCode: 500, statusMessage: existingErr.message })
    if (!existingRow) throw createError({ statusCode: 404, statusMessage: 'Promo not found.' })
    existing = existingRow as PromoExistingRow
  }

  const code = body.code.trim().toUpperCase()
  const discountName = body.description?.trim()
    ? `${code} - ${body.description.trim()}`
    : code
  const existingSquareDiscountId = existing?.square_discount_id?.trim() || null
  const discountTempId = `#promo_discount_${randomUUID().slice(0, 8)}`
  const discountObjectId = existingSquareDiscountId ?? discountTempId
  let squareDiscountId: string | null = null

  try {
    const object = body.discountType === 'percent'
      ? {
          id: discountObjectId,
          type: 'DISCOUNT' as const,
          presentAtAllLocations: true,
          discountData: {
            name: discountName,
            discountType: 'FIXED_PERCENTAGE' as const,
            percentage: formatPercent(normalizedDiscountValue)
          }
        }
      : {
          id: discountObjectId,
          type: 'DISCOUNT' as const,
          presentAtAllLocations: true,
          discountData: {
            name: discountName,
            discountType: 'FIXED_AMOUNT' as const,
            amountMoney: {
              amount: BigInt(normalizedDiscountValue),
              currency: 'USD'
            }
          }
        }

    const upsertRes = await square.catalog.object.upsert({
      idempotencyKey: randomUUID(),
      object
    } as never) as {
      idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }>
      catalogObject?: { id?: string | null } | null
    }

    squareDiscountId = upsertRes.idMappings?.find(entry => entry.clientObjectId === discountTempId)?.objectId
      ?? upsertRes.catalogObject?.id
      ?? existingSquareDiscountId
      ?? null

    if (!squareDiscountId) {
      throw new Error('Square did not return a discount id.')
    }
  } catch (error) {
    throw createError({ statusCode: 502, statusMessage: `Failed to sync promo discount to Square: ${extractSquareErrorMessage(error)}` })
  }

  const mergedMetadata = {
    ...(existing?.metadata ?? {}),
    applies_tier_ids: body.appliesTierIds,
    square_discount_synced_at: new Date().toISOString(),
    square_discount_name: discountName
  }

  const payload = {
    code,
    description: body.description ?? null,
    discount_type: body.discountType,
    discount_value: normalizedDiscountValue,
    applies_to: body.appliesTo,
    metadata: mergedMetadata,
    square_discount_id: squareDiscountId,
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
