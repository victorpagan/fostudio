// File: server/api/checkout/session.post.ts
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { resolveServerUserRole } from '~~/server/utils/auth'
import { getSingleTierCapacity, isPriorityMemberForWaitlist } from '~~/server/utils/membership/capacity'
import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'

const bodySchema = z.object({
  tier: z.string().min(1),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']).optional(),
  returnTo: z.string().min(1).optional(),
  guest_email: z.string().email().optional(),
  promo_code: z.string().min(2).max(64).optional()
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type GuestCheckoutSessionInsertResult = {
  id: string
  token: string
}
type PromoRow = {
  id: string
  code: string
  discount_type: 'percent' | 'fixed_cents'
  discount_value: number | string
  applies_to: 'all' | 'membership' | 'credits'
  active: boolean
  starts_at: string | null
  ends_at: string | null
  max_redemptions: number | null
  redemptions_count: number
  metadata: Record<string, unknown> | null
}

type PromoPricing = {
  code: string
  promoId: string
  discountCents: number
  effectivePriceCents: number
}

function normalizeReturnTo(value: string | undefined, fallback = '/dashboard/membership') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}

function normalizeEmail(value: string | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized || null
}

function normalizePromoCode(value: string | undefined) {
  const normalized = (value ?? '').trim().toUpperCase()
  return normalized || null
}

function readPromoTierScope(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.applies_tier_ids
  if (!Array.isArray(raw)) return [] as string[]
  return raw.map(entry => String(entry ?? '').trim()).filter(Boolean)
}


async function resolveMembershipPromoPricing(params: {
  supabase: any
  promoCode: string | null
  tierId: string
  basePriceCents: number
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
  if (promo.applies_to !== 'all' && promo.applies_to !== 'membership') {
    throw createError({ statusCode: 400, statusMessage: 'Promo code is not valid for memberships.' })
  }

  const now = Date.now()
  const startsAt = promo.starts_at ? Date.parse(promo.starts_at) : Number.NaN
  const endsAt = promo.ends_at ? Date.parse(promo.ends_at) : Number.NaN
  if (Number.isFinite(startsAt) && now < startsAt) throw createError({ statusCode: 400, statusMessage: 'Promo code is not active yet.' })
  if (Number.isFinite(endsAt) && now >= endsAt) throw createError({ statusCode: 400, statusMessage: 'Promo code has expired.' })

  const tierScope = readPromoTierScope(promo.metadata)
  if (tierScope.length > 0 && !tierScope.includes(params.tierId)) {
    throw createError({ statusCode: 400, statusMessage: 'Promo code does not apply to this membership tier.' })
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

  return {
    code: promo.code,
    promoId: promo.id,
    discountCents,
    effectivePriceCents
  } as PromoPricing
}

function addCadenceInterval(startIso: string, cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual') {
  const value = new Date(startIso)
  if (cadence === 'daily') {
    value.setUTCDate(value.getUTCDate() + 1)
    return value.toISOString()
  }
  if (cadence === 'weekly') {
    value.setUTCDate(value.getUTCDate() + 7)
    return value.toISOString()
  }
  const months = cadence === 'annual' ? 12 : cadence === 'quarterly' ? 3 : 1
  value.setUTCMonth(value.getUTCMonth() + months)
  return value.toISOString()
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  const userId = user?.sub && UUID_RE.test(user.sub) ? user.sub : null
  const supabase = serverSupabaseServiceRole(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const parsed = bodySchema.parse(await readBody(event))
  const tierId = parsed.tier
  const cadence = parsed.cadence ?? 'monthly'
  const returnTo = normalizeReturnTo(parsed.returnTo)
  const guestEmail = normalizeEmail(parsed.guest_email)
  const promoCode = normalizePromoCode(parsed.promo_code)

  const { isAdmin } = await resolveServerUserRole(event, user)

  // ── 1) Validate tier exists and is accessible ──────────────────────────
  const { data: tier, error: tierErr } = await db
    .from('membership_tiers')
    .select('id,display_name,active,visible,direct_access_only')
    .eq('id', tierId)
    .maybeSingle()

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })
  if (!tier || !tier.active) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid membership tier' })
  }

  if (tier.direct_access_only && !isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied' })
  }

  // Hidden tiers (e.g. 'test') are admin-only
  if (!tier.visible && !isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied' })
  }

  let isPriorityMember = false
  if (userId) {
    isPriorityMember = await isPriorityMemberForWaitlist(supabase as any, userId)
  }

  const capacity = await getSingleTierCapacity(supabase as any, tierId)
  if (capacity.isFull && !isPriorityMember && !isAdmin) {
    throw createError({
      statusCode: 409,
      statusMessage: `${tier.display_name} is currently full. Join the waitlist to get notified when a spot opens.`
    })
  }

  // ── 2) Lookup plan variation ─────────────────────────────────────────────
  const { data: variation, error: varErr } = await supabase
    .from('membership_plan_variations')
    .select('provider,provider_plan_variation_id,active,visible,price_cents,currency,credits_per_month')
    .eq('tier_id', tierId)
    .eq('cadence', cadence)
    .eq('provider', 'square')
    .maybeSingle()

  if (varErr) throw createError({ statusCode: 500, statusMessage: varErr.message })
  if (!variation || !variation.active) {
    throw createError({ statusCode: 400, statusMessage: 'Plan option not available' })
  }

  const planPriceCents = Number(variation.price_cents ?? 0)
  const planCurrency = typeof variation.currency === 'string' && variation.currency.trim()
    ? variation.currency.trim().toUpperCase()
    : 'USD'
  const promoPricing = await resolveMembershipPromoPricing({
    supabase,
    promoCode,
    tierId,
    basePriceCents: planPriceCents
  })
  const effectivePlanPriceCents = promoPricing?.effectivePriceCents ?? planPriceCents

  // Hidden plan variations accessible to admins (e.g. test tier $0 plan)
  if (!variation.visible && !isAdmin) {
    throw createError({ statusCode: 400, statusMessage: 'Plan option not available' })
  }

  const isTestTier = tierId === 'test'
  if (!isTestTier && effectivePlanPriceCents > 0 && effectivePlanPriceCents < 100) {
    throw createError({
      statusCode: 400,
      statusMessage: `Plan price is below Square minimum. Expected cents, got ${effectivePlanPriceCents}.`
    })
  }
  let resolvedPlanVariationId: string | null = null

  if (isTestTier && !userId) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to use the admin test tier' })
  }

  if (!isTestTier) {
    resolvedPlanVariationId = variation.provider_plan_variation_id?.trim() || null

    if (!resolvedPlanVariationId) {
      throw createError({
        statusCode: 503,
        statusMessage: 'This membership plan is not linked to a Square variation yet. Map plan IDs in Admin Subscriptions.'
      })
    }
  }

  // ── 3a) Guest checkout (no auth required) ────────────────────────────────
  // Guests can complete payment first, then create/sign in to claim
  // the membership from /checkout/success.
  if (!userId) {
    if (!guestEmail) {
      throw createError({ statusCode: 400, statusMessage: 'Email is required to continue checkout.' })
    }

    const { data: existingCustomer, error: existingCustomerErr } = await supabase
      .from('customers')
      .select('id,user_id,email')
      .ilike('email', guestEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingCustomerErr) {
      throw createError({ statusCode: 500, statusMessage: existingCustomerErr.message })
    }

    if (existingCustomer?.user_id) {
      const { data: existingMembership, error: existingMembershipErr } = await supabase
        .from('memberships')
        .select('id,status')
        .eq('user_id', existingCustomer.user_id)
        .in('status', ['active', 'pending_checkout', 'past_due'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingMembershipErr) {
        throw createError({ statusCode: 500, statusMessage: existingMembershipErr.message })
      }

      if (existingMembership) {
        throw createError({
          statusCode: 409,
          statusMessage: 'This email is already linked to a member account. Sign in to manage or change the existing membership.'
        })
      }
    }

    const checkoutToken = randomUUID()
    const { data: checkoutSession, error: sessionErr } = await supabase
      .from('membership_checkout_sessions')
      .insert({
        token: checkoutToken,
        tier: tierId,
        cadence,
        status: 'pending',
        return_to: returnTo,
        guest_email: guestEmail,
        payment_provider: 'square',
        plan_variation_id: resolvedPlanVariationId,
        metadata: promoPricing
          ? {
              promo_code: promoPricing.code,
              promo_id: promoPricing.promoId,
              promo_discount_cents: promoPricing.discountCents,
              base_price_cents: planPriceCents,
              effective_price_cents: effectivePlanPriceCents
            }
          : null
      })
      .select('id,token')
      .single()

    if (sessionErr || !checkoutSession) {
      throw createError({ statusCode: 500, statusMessage: sessionErr?.message ?? 'Failed to create checkout session' })
    }

    const session = checkoutSession as GuestCheckoutSessionInsertResult
    return {
      provider: 'square_web_payments',
      checkoutToken: session.token,
      amountCents: effectivePlanPriceCents,
      currency: planCurrency,
      tier: tierId,
      cadence
    }
  }

  // ── 3) Upsert membership row ─────────────────────────────────────────────
  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (memErr) throw createError({ statusCode: 500, statusMessage: memErr.message })

  // Block duplicate active Square-managed memberships from starting a second checkout.
  // Allow active non-managed memberships (ex: admin/test tier) to transition into Square.
  if (membership?.status?.toLowerCase() === 'active' && !isTestTier) {
    const billingProvider = (membership.billing_provider ?? '').toLowerCase()
    const billingSubscriptionId = typeof membership.billing_subscription_id === 'string' ? membership.billing_subscription_id.trim() : ''
    const squareSubscriptionId = typeof membership.square_subscription_id === 'string' ? membership.square_subscription_id.trim() : ''
    const hasManagedSquareSubscription = billingProvider === 'square' && (Boolean(billingSubscriptionId) || Boolean(squareSubscriptionId))

    if (hasManagedSquareSubscription) {
      throw createError({ statusCode: 409, statusMessage: 'Membership already active' })
    }
  }

  let membershipId: string
  if (!membership) {
    const { data: inserted, error: insErr } = await supabase
      .from('memberships')
      .insert({
        user_id: userId,
        tier: tierId as never,
        cadence,
        status: 'pending_checkout' as const
      })
      .select('id')
      .single()

    if (insErr || !inserted) throw createError({ statusCode: 500, statusMessage: insErr?.message ?? 'Failed to create membership' })
    membershipId = inserted.id
  } else {
    const { error: updErr } = await supabase
      .from('memberships')
      .update({
        tier: tierId as never,
        cadence,
        status: 'pending_checkout' as const
      })
      .eq('id', membership.id)

    if (updErr) throw createError({ statusCode: 500, statusMessage: updErr.message })
    membershipId = membership.id
  }

  let authCheckoutSession: GuestCheckoutSessionInsertResult | null = null
  if (!isTestTier) {
    const checkoutToken = randomUUID()
    const { data: checkoutSession, error: checkoutSessionErr } = await supabase
      .from('membership_checkout_sessions')
      .insert({
        token: checkoutToken,
        tier: tierId,
        cadence,
        status: 'pending',
        return_to: returnTo,
        guest_email: user?.email ?? null,
        payment_provider: 'square',
        plan_variation_id: resolvedPlanVariationId,
        metadata: promoPricing
          ? {
              promo_code: promoPricing.code,
              promo_id: promoPricing.promoId,
              promo_discount_cents: promoPricing.discountCents,
              base_price_cents: planPriceCents,
              effective_price_cents: effectivePlanPriceCents
            }
          : null
      })
      .select('id,token')
      .single()

    if (checkoutSessionErr || !checkoutSession) {
      throw createError({ statusCode: 500, statusMessage: checkoutSessionErr?.message ?? 'Failed to create checkout session' })
    }

    authCheckoutSession = checkoutSession as GuestCheckoutSessionInsertResult
  }

  // ── Test tier: skip Square entirely, immediately confirm ─────────────────
  // This lets admins exercise the full UI flow without a real charge.
  if (isTestTier) {
    const periodStart = new Date().toISOString()
    const periodEnd = addCadenceInterval(periodStart, cadence)

    const { error: confirmErr } = await supabase
      .from('memberships')
      .update({
        status: 'active',
        checkout_provider: 'test',
        billing_provider: 'test',
        current_period_start: periodStart,
        current_period_end: periodEnd,
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', membershipId)

    if (confirmErr) throw createError({ statusCode: 500, statusMessage: confirmErr.message })

    // Keep test-tier credits consistent with production grant behavior:
    // schedule monthly grant rows and process anything due now.
    try {
      const { error: backfillErr } = await supabase.rpc('backfill_membership_credit_grants', {
        p_membership_id: membershipId
      })
      if (backfillErr) {
        console.error('[checkout-session] test-tier backfill failed', backfillErr)
      } else {
        const { error: processErr } = await supabase.rpc('process_due_membership_credit_grants', {
          p_limit: 24
        })
        if (processErr) {
          console.error('[checkout-session] test-tier grant processing failed', processErr)
        }
      }
    } catch (error) {
      console.error('[checkout-session] test-tier grant rpc unavailable', error)
    }

    return {
      redirectUrl: `/checkout/success?test=1&returnTo=${encodeURIComponent(returnTo)}`,
      provider: 'test'
    }
  }

  // ── 4) Return web-payments checkout token (card entry happens in-app) ─────
  const checkoutToken = authCheckoutSession?.token
  if (!checkoutToken) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to initialize checkout session token' })
  }
  const { error: saveErr } = await supabase
    .from('memberships')
    .update({
      checkout_provider: 'square_web_payments',
      checkout_payment_link_id: null,
      checkout_order_template_id: null,
      square_plan_variation_id: resolvedPlanVariationId
    })
    .eq('id', membershipId)

  if (saveErr) throw createError({ statusCode: 500, statusMessage: saveErr.message })

  return {
    provider: 'square_web_payments',
    checkoutToken,
    amountCents: effectivePlanPriceCents,
    currency: planCurrency,
    tier: tierId,
    cadence
  }
})
