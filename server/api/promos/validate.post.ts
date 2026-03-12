import { z } from 'zod'
import { serverSupabaseServiceRole } from '#supabase/server'
import { getCreditOptionEffectivePriceCents } from '~~/server/utils/credits/topup'
import type { CreditPricingOptionRow } from '~~/server/utils/credits/topup'
import { normalizePromoCode, resolvePromoPricing } from '~~/server/utils/promos'

const bodySchema = z.object({
  context: z.enum(['membership', 'credits', 'holds']),
  promo_code: z.string().min(2).max(64),
  tier: z.string().min(1).optional(),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']).optional(),
  optionKey: z.string().min(1).optional()
})

const DEFAULT_HOLD_TOPUP_PRICE_CENTS = 2500

export default defineEventHandler(async (event) => {
  const supabase = serverSupabaseServiceRole(event)
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))
  const promoCode = normalizePromoCode(body.promo_code)
  if (!promoCode) throw createError({ statusCode: 400, statusMessage: 'Promo code is required.' })

  let basePriceCents = 0
  let tierId: string | null = null

  if (body.context === 'membership') {
    if (!body.tier || !body.cadence) {
      throw createError({ statusCode: 400, statusMessage: 'Tier and cadence are required for membership promo validation.' })
    }
    tierId = body.tier
    const { data: variation, error: variationErr } = await db
      .from('membership_plan_variations')
      .select('price_cents,active')
      .eq('tier_id', body.tier)
      .eq('cadence', body.cadence)
      .eq('provider', 'square')
      .maybeSingle()

    if (variationErr) throw createError({ statusCode: 500, statusMessage: variationErr.message })
    if (!variation || !variation.active) {
      throw createError({ statusCode: 400, statusMessage: 'Selected membership option is not available.' })
    }
    basePriceCents = Number(variation.price_cents ?? 0)
  } else if (body.context === 'credits') {
    if (!body.optionKey) {
      throw createError({ statusCode: 400, statusMessage: 'Credit option is required for promo validation.' })
    }
    const { data: optionRaw, error: optionErr } = await db
      .from('credit_pricing_options')
      .select('id,key,label,description,credits,base_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,active,sort_order,square_item_id,square_variation_id')
      .eq('key', body.optionKey)
      .eq('active', true)
      .maybeSingle()

    if (optionErr) throw createError({ statusCode: 500, statusMessage: optionErr.message })
    if (!optionRaw) throw createError({ statusCode: 400, statusMessage: 'Invalid credit option.' })
    basePriceCents = getCreditOptionEffectivePriceCents(optionRaw as CreditPricingOptionRow)
  } else {
    const { data: configRows, error: configErr } = await db
      .from('system_config')
      .select('key,value')
      .eq('key', 'hold_topup_price_cents')

    if (configErr) throw createError({ statusCode: 500, statusMessage: configErr.message })
    const configured = configRows?.[0]?.value
    const parsed = Math.floor(Number(configured ?? DEFAULT_HOLD_TOPUP_PRICE_CENTS))
    basePriceCents = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HOLD_TOPUP_PRICE_CENTS
  }

  if (!Number.isFinite(basePriceCents) || basePriceCents < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Base price is invalid for promo validation.' })
  }

  const promo = await resolvePromoPricing({
    supabase,
    promoCode,
    context: body.context,
    tierId,
    creditOptionKey: body.optionKey ?? null,
    basePriceCents
  })

  if (!promo) throw createError({ statusCode: 400, statusMessage: 'Promo code is invalid.' })

  return {
    valid: true,
    promo: {
      code: promo.code,
      promoId: promo.promoId,
      discountCents: promo.discountCents,
      effectivePriceCents: promo.effectivePriceCents,
      basePriceCents,
      squareDiscountId: promo.squareDiscountId
    }
  }
})
