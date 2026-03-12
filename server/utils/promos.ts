type PromoAppliesTo = 'all' | 'membership' | 'credits' | 'holds'

type PromoRow = {
  id: string
  code: string
  discount_type: 'percent' | 'fixed_cents'
  discount_value: number | string
  applies_to: PromoAppliesTo
  active: boolean
  starts_at: string | null
  ends_at: string | null
  max_redemptions: number | null
  redemptions_count: number
  metadata: Record<string, unknown> | null
  square_discount_id: string | null
}

export type PromoPricing = {
  code: string
  promoId: string
  discountCents: number
  effectivePriceCents: number
  squareDiscountId: string | null
}

export function normalizePromoCode(value: string | undefined | null) {
  const normalized = (value ?? '').trim().toUpperCase()
  return normalized || null
}

function readPromoTierScope(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.applies_tier_ids
  if (!Array.isArray(raw)) return [] as string[]
  return raw.map(entry => String(entry ?? '').trim()).filter(Boolean)
}

function readPromoCreditScope(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.applies_credit_option_keys
  if (!Array.isArray(raw)) return [] as string[]
  return raw.map(entry => String(entry ?? '').trim()).filter(Boolean)
}

function appliesToContext(appliesTo: PromoAppliesTo, context: 'membership' | 'credits' | 'holds') {
  if (appliesTo === 'all') return true
  return appliesTo === context
}

export async function resolvePromoPricing(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  promoCode: string | null
  context: 'membership' | 'credits' | 'holds'
  tierId?: string | null
  creditOptionKey?: string | null
  basePriceCents: number
  requireSquareDiscount?: boolean
}) {
  if (!params.promoCode) return null

  const { data: promoRaw, error } = await params.supabase
    .from('promo_codes')
    .select('*')
    .eq('code', params.promoCode)
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!promoRaw) throw createError({ statusCode: 400, statusMessage: 'Invalid promo code.' })

  const promo = promoRaw as PromoRow
  if (!promo.active) throw createError({ statusCode: 400, statusMessage: 'Promo code is inactive.' })
  if (!appliesToContext(promo.applies_to, params.context)) {
    throw createError({ statusCode: 400, statusMessage: `Promo code is not valid for ${params.context}.` })
  }

  const now = Date.now()
  const startsAt = promo.starts_at ? Date.parse(promo.starts_at) : Number.NaN
  const endsAt = promo.ends_at ? Date.parse(promo.ends_at) : Number.NaN
  if (Number.isFinite(startsAt) && now < startsAt) throw createError({ statusCode: 400, statusMessage: 'Promo code is not active yet.' })
  if (Number.isFinite(endsAt) && now >= endsAt) throw createError({ statusCode: 400, statusMessage: 'Promo code has expired.' })

  if (params.context === 'membership') {
    const tierScope = readPromoTierScope(promo.metadata)
    if (tierScope.length > 0 && params.tierId && !tierScope.includes(params.tierId)) {
      throw createError({ statusCode: 400, statusMessage: 'Promo code does not apply to this membership tier.' })
    }
  }
  if (params.context === 'credits') {
    const creditScope = readPromoCreditScope(promo.metadata)
    if (creditScope.length > 0 && params.creditOptionKey && !creditScope.includes(params.creditOptionKey)) {
      throw createError({ statusCode: 400, statusMessage: 'Promo code does not apply to this credit package.' })
    }
  }

  const maxRedemptions = typeof promo.max_redemptions === 'number' ? promo.max_redemptions : null
  if (maxRedemptions !== null && Number(promo.redemptions_count ?? 0) >= maxRedemptions) {
    throw createError({ statusCode: 400, statusMessage: 'Promo code redemption limit reached.' })
  }

  const discountValue = Number(promo.discount_value ?? 0)
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Promo code discount value is invalid.' })
  }

  let discountCents = 0
  if (promo.discount_type === 'percent') {
    discountCents = Math.round(params.basePriceCents * Math.min(100, Math.max(0, discountValue)) / 100)
  } else {
    discountCents = Math.round(discountValue)
  }

  discountCents = Math.max(0, Math.min(params.basePriceCents, discountCents))
  const effectivePriceCents = Math.max(0, params.basePriceCents - discountCents)
  if (effectivePriceCents > 0 && effectivePriceCents < 100) {
    throw createError({ statusCode: 400, statusMessage: 'Promo reduces price below Square minimum ($1.00).' })
  }

  const squareDiscountId = promo.square_discount_id?.trim() || null
  if (params.requireSquareDiscount !== false && !squareDiscountId) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Promo code is not synced to Square yet. Re-save this promo in Admin > Promos.'
    })
  }

  return {
    code: promo.code,
    promoId: promo.id,
    discountCents,
    effectivePriceCents,
    squareDiscountId
  } as PromoPricing
}

export async function markPromoRedemption(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  promoId: string,
  logPrefix: string
) {
  const { data: promoRaw, error: promoErr } = await supabase
    .from('promo_codes')
    .select('id,redemptions_count,max_redemptions')
    .eq('id', promoId)
    .maybeSingle()

  if (promoErr || !promoRaw) return
  const promo = promoRaw as { id: string, redemptions_count: number, max_redemptions: number | null }
  const currentCount = Number(promo.redemptions_count ?? 0)
  const maxRedemptions = typeof promo.max_redemptions === 'number' ? promo.max_redemptions : null
  if (maxRedemptions !== null && currentCount >= maxRedemptions) return

  const { error: updateErr } = await supabase
    .from('promo_codes')
    .update({ redemptions_count: currentCount + 1 })
    .eq('id', promoId)
    .eq('redemptions_count', currentCount)

  if (updateErr) {
    console.warn(`${logPrefix} failed to mark promo redemption`, updateErr.message)
  }
}
