import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const variationSchema = z.object({
  cadence: z.enum(['monthly', 'quarterly', 'annual']),
  provider: z.literal('square').default('square'),
  providerPlanId: z.string().optional().nullable(),
  providerPlanVariationId: z.string().optional().nullable(),
  creditsPerMonth: z.number().min(0),
  priceCents: z.number().int().min(0),
  currency: z.string().default('USD'),
  discountLabel: z.string().max(64).optional().nullable(),
  active: z.boolean().default(true),
  visible: z.boolean().default(true),
  sortOrder: z.number().int().default(0)
})

const bodySchema = z.object({
  id: z.string().min(2).max(48).regex(/^[a-z][a-z0-9_]*$/),
  displayName: z.string().min(2).max(80),
  description: z.string().max(240).optional().nullable(),
  bookingWindowDays: z.number().int().min(1).max(365),
  peakMultiplier: z.number().min(1).max(4),
  maxBank: z.number().int().min(0).max(10000),
  maxSlots: z.number().int().min(0).max(10000).optional().nullable(),
  holdsIncluded: z.number().int().min(0).max(50),
  active: z.boolean().default(true),
  visible: z.boolean().default(true),
  directAccessOnly: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  variations: z.array(variationSchema).min(1)
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const tierRow = {
    id: body.id,
    display_name: body.displayName,
    description: body.description ?? null,
    booking_window_days: body.bookingWindowDays,
    peak_multiplier: body.peakMultiplier,
    max_bank: body.maxBank,
    max_slots: body.maxSlots ?? null,
    holds_included: body.holdsIncluded,
    active: body.active,
    visible: body.directAccessOnly ? false : body.visible,
    direct_access_only: body.directAccessOnly,
    sort_order: body.sortOrder
  }

  const { error: tierErr } = await supabase
    .from('membership_tiers')
    .upsert(tierRow, { onConflict: 'id' })

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })

  const variationRows = body.variations.map(variation => ({
    tier_id: body.id,
    cadence: variation.cadence,
    provider: variation.provider,
    provider_plan_id: variation.providerPlanId ?? null,
    provider_plan_variation_id: variation.providerPlanVariationId ?? null,
    credits_per_month: variation.creditsPerMonth,
    price_cents: variation.priceCents,
    currency: variation.currency.toUpperCase(),
    discount_label: variation.discountLabel ?? null,
    active: variation.active,
    visible: body.directAccessOnly ? false : variation.visible,
    sort_order: variation.sortOrder
  }))

  const { error: variationErr } = await supabase
    .from('membership_plan_variations')
    .upsert(variationRows, { onConflict: 'tier_id,cadence,provider' })

  if (variationErr) throw createError({ statusCode: 500, statusMessage: variationErr.message })

  const disabledCadences = (['monthly', 'quarterly', 'annual'] as const).filter(
    cadence => !body.variations.some(variation => variation.cadence === cadence)
  )

  if (disabledCadences.length > 0) {
    const { error: disableErr } = await supabase
      .from('membership_plan_variations')
      .update({ active: false, visible: false })
      .eq('tier_id', body.id)
      .eq('provider', 'square')
      .in('cadence', disabledCadences)

    if (disableErr) throw createError({ statusCode: 500, statusMessage: disableErr.message })
  }

  return {
    ok: true,
    tierId: body.id
  }
})
