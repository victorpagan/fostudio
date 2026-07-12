import { serverSupabaseServiceRole } from '#supabase/server'
import {
  formatHourLabel,
  loadGuestBookingPolicy,
  loadStandbyBookingPolicy
} from '~~/server/utils/booking/guestPolicy'

type PromoMetadata = {
  applies_tier_ids?: unknown
  feature_on_homepage?: unknown
}

type FeaturedPromoRow = {
  code: string
  description: string | null
  discount_type: 'percent' | 'fixed_cents'
  discount_value: number | string
  applies_to: 'all' | 'membership' | 'credits' | 'holds'
  active: boolean
  starts_at: string | null
  ends_at: string | null
  max_redemptions: number | null
  redemptions_count: number
  metadata: PromoMetadata | null
  square_discount_id: string | null
}

type PublicTierRow = {
  id: string
  display_name: string
  sort_order: number
}

type MonthlyVariationRow = {
  tier_id: string
  credits_per_month: number | string
  price_cents: number | string
}

function isPromoAvailable(promo: FeaturedPromoRow, now = Date.now()) {
  if (!promo.active || !promo.square_discount_id?.trim()) return false
  if (promo.applies_to !== 'all' && promo.applies_to !== 'membership') return false

  const startsAt = promo.starts_at ? Date.parse(promo.starts_at) : Number.NaN
  const endsAt = promo.ends_at ? Date.parse(promo.ends_at) : Number.NaN
  if (Number.isFinite(startsAt) && now < startsAt) return false
  if (Number.isFinite(endsAt) && now >= endsAt) return false

  return promo.max_redemptions === null
    || Number(promo.redemptions_count ?? 0) < Number(promo.max_redemptions)
}

function readTierScope(metadata: PromoMetadata | null) {
  if (!Array.isArray(metadata?.applies_tier_ids)) return []
  return metadata.applies_tier_ids
    .map(value => String(value ?? '').trim())
    .filter(Boolean)
}

function formatCompactHour(hour: number) {
  return formatHourLabel(hour).replace(':00', '')
}

export default defineEventHandler(async (event) => {
  const supabase = serverSupabaseServiceRole(event)

  const [guestPolicy, standbyPolicy, tierResult, promoResult] = await Promise.all([
    loadGuestBookingPolicy(event),
    loadStandbyBookingPolicy(event),
    supabase
      .from('membership_tiers')
      .select('id,display_name,sort_order')
      .eq('active', true)
      .eq('visible', true)
      .eq('direct_access_only', false)
      .order('sort_order', { ascending: true }),
    supabase
      .from('promo_codes')
      .select('code,description,discount_type,discount_value,applies_to,active,starts_at,ends_at,max_redemptions,redemptions_count,metadata,square_discount_id')
      .contains('metadata', { feature_on_homepage: true })
      .order('updated_at', { ascending: false })
      .limit(5)
  ])

  if (tierResult.error) {
    throw createError({ statusCode: 500, statusMessage: tierResult.error.message })
  }
  if (promoResult.error) {
    throw createError({ statusCode: 500, statusMessage: promoResult.error.message })
  }

  const tiers = (tierResult.data ?? []) as PublicTierRow[]
  const tierIds = tiers.map(tier => tier.id)
  const variationResult = tierIds.length
    ? await supabase
        .from('membership_plan_variations')
        .select('tier_id,credits_per_month,price_cents')
        .in('tier_id', tierIds)
        .eq('cadence', 'monthly')
        .eq('provider', 'square')
        .eq('active', true)
        .eq('visible', true)
    : { data: [], error: null }

  if (variationResult.error) {
    throw createError({ statusCode: 500, statusMessage: variationResult.error.message })
  }

  const monthlyVariations = (variationResult.data ?? []) as MonthlyVariationRow[]
  const entryVariation = monthlyVariations
    .map((variation) => {
      const tier = tiers.find(candidate => candidate.id === variation.tier_id)
      return {
        tierId: variation.tier_id,
        tierName: tier?.display_name ?? variation.tier_id,
        tierSortOrder: Number(tier?.sort_order ?? Number.MAX_SAFE_INTEGER),
        creditsPerMonth: Number(variation.credits_per_month ?? 0),
        priceCents: Number(variation.price_cents ?? 0)
      }
    })
    .filter(variation => Number.isFinite(variation.priceCents) && variation.priceCents > 0)
    .sort((left, right) => left.priceCents - right.priceCents || left.tierSortOrder - right.tierSortOrder)[0] ?? null

  const featuredPromo = ((promoResult.data ?? []) as FeaturedPromoRow[])
    .find(promo => isPromoAvailable(promo)) ?? null
  const promoTierScope = featuredPromo ? readTierScope(featuredPromo.metadata) : []
  const promoTierNames = featuredPromo
    ? tiers
        .filter(tier => !promoTierScope.length || promoTierScope.includes(tier.id))
        .map(tier => tier.display_name)
    : []

  setResponseHeader(event, 'Cache-Control', 'public, max-age=60, stale-while-revalidate=300')

  return {
    guest: {
      startHour: guestPolicy.startHour,
      endHour: guestPolicy.endHour,
      hoursLabel: `${formatCompactHour(guestPolicy.startHour)}–${formatCompactHour(guestPolicy.endHour)}`,
      bookingWindowDays: guestPolicy.bookingWindowDays,
      minBookingHours: guestPolicy.minBookingHours,
      ratePerCreditCents: guestPolicy.ratePerCreditCents,
      peakMultiplier: guestPolicy.peakMultiplier,
      bookingIncrementMinutes: guestPolicy.bookingIncrementMinutes,
      creditExpiryDays: guestPolicy.creditExpiryDays
    },
    standby: {
      enabled: standbyPolicy.enabled,
      minOpenSlotHours: standbyPolicy.minOpenSlotHours,
      discountPercent: Math.round((1 - standbyPolicy.discountMultiplier) * 100),
      memberStartHour: standbyPolicy.memberStartHour,
      memberStartHourLabel: formatCompactHour(standbyPolicy.memberStartHour),
      memberWindowHours: standbyPolicy.memberWindowHours,
      nonMemberWindowHours: standbyPolicy.guestWindowHours
    },
    membership: entryVariation
      ? {
          tierId: entryVariation.tierId,
          tierName: entryVariation.tierName,
          startingPriceCents: entryVariation.priceCents,
          startingCreditsPerMonth: entryVariation.creditsPerMonth
        }
      : null,
    featuredPromo: featuredPromo
      ? {
          code: featuredPromo.code,
          description: featuredPromo.description,
          discountType: featuredPromo.discount_type,
          discountValue: Number(featuredPromo.discount_value),
          endsAt: featuredPromo.ends_at,
          tierNames: promoTierNames
        }
      : null
  }
})
