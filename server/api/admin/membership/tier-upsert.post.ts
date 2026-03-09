import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { inviteWaitlistForTier } from '~~/server/utils/membership/waitlist'

const variationSchema = z.object({
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']),
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
  maxSlots: z.number().int().min(0).max(10000).optional().nullable().default(10),
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
  const cadenceOrder = ['daily', 'weekly', 'monthly', 'quarterly', 'annual'] as const
  const enabledVariations = body.variations.filter(variation => variation.active)

  if (enabledVariations.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Enable at least one billing cadence.' })
  }

  const missingPlanLink = enabledVariations.find((variation) => {
    const planId = variation.providerPlanId?.trim()
    const variationId = variation.providerPlanVariationId?.trim()
    return !planId || !variationId
  })
  if (missingPlanLink) {
    throw createError({
      statusCode: 400,
      statusMessage: `Missing Square plan link for ${missingPlanLink.cadence}. Provide both plan ID and variation ID.`
    })
  }

  const knownPlanIds = new Set(
    enabledVariations
      .map(variation => variation.providerPlanId?.trim())
      .filter((id): id is string => Boolean(id))
  )
  if (knownPlanIds.size > 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Enabled cadences must share the same Square plan ID.'
    })
  }

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

  const variationRows = enabledVariations.map((variation) => {
    return {
      tier_id: body.id,
      cadence: variation.cadence,
      provider: variation.provider,
      provider_plan_id: variation.providerPlanId?.trim() ?? null,
      provider_plan_variation_id: variation.providerPlanVariationId?.trim() ?? null,
      credits_per_month: variation.creditsPerMonth,
      price_cents: variation.priceCents,
      currency: variation.currency.toUpperCase(),
      discount_label: variation.discountLabel?.trim() || null,
      active: true,
      visible: body.directAccessOnly ? false : variation.visible,
      sort_order: variation.sortOrder
    }
  })

  const { error: variationErr } = await supabase
    .from('membership_plan_variations')
    .upsert(variationRows, { onConflict: 'tier_id,cadence,provider' })

  if (variationErr) throw createError({ statusCode: 500, statusMessage: variationErr.message })

  const disabledCadences = cadenceOrder.filter(
    cadence => !enabledVariations.some(variation => variation.cadence === cadence)
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

  await inviteWaitlistForTier(event, body.id).catch((error) => {
    console.warn('[admin/membership/tier-upsert] waitlist invite pass failed', {
      tierId: body.id,
      message: error instanceof Error ? error.message : String(error)
    })
  })

  return {
    ok: true,
    tierId: body.id,
    squarePlanId: Array.from(knownPlanIds)[0] ?? null,
    linkedCadences: enabledVariations.map(variation => variation.cadence)
  }
})
