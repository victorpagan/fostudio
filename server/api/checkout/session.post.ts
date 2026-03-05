// File: server/api/checkout/session.post.ts
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { resolveServerUserRole } from '~~/server/utils/auth'
import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'

const bodySchema = z.object({
  tier: z.string().min(1),
  cadence: z.enum(['monthly', 'quarterly', 'annual']).optional(),
  returnTo: z.string().min(1).optional(),
  guest_email: z.string().email().optional()
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SquarePaymentLinkResult = {
  paymentLink?: {
    id?: string | null
    orderId?: string | null
    url?: string | null
  } | null
}

type GuestCheckoutSessionInsertResult = {
  id: string
  token: string
}

type SquareClient = Awaited<ReturnType<typeof useSquareClient>>

function normalizeReturnTo(value: string | undefined, fallback = '/dashboard/membership') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}

function normalizeEmail(value: string | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized || null
}

async function resolvePlanVariationId(
  event: H3Event,
  providerPlanVariationId: string | null | undefined,
  tierId: string,
  cadence: 'monthly' | 'quarterly' | 'annual'
) {
  const directValue = providerPlanVariationId?.trim()
  if (directValue) return directValue

  const configKey = `SQUARE_PLAN_VARIATION_${tierId.toUpperCase()}_${cadence.toUpperCase()}`

  try {
    const configuredValue = await getServerConfig(event, configKey)
    if (typeof configuredValue === 'string' && configuredValue.trim()) {
      return configuredValue.trim()
    }
  } catch {
    // Missing config should fall through to a clear checkout error below.
  }

  return null
}

function extractSquareErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  if (typeof error === 'object' && error !== null) {
    const details = (error as { errors?: unknown }).errors
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0]
      if (first && typeof first === 'object') {
        const detail = (first as { detail?: unknown }).detail
        if (typeof detail === 'string' && detail.trim()) return detail.trim()
      }
    }
  }

  return 'Square checkout error'
}

function truncateErrorMessage(message: string, max = 220): string {
  const collapsed = message.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= max) return collapsed
  return `${collapsed.slice(0, max - 3)}...`
}

function addCadenceMonths(startIso: string, cadence: 'monthly' | 'quarterly' | 'annual') {
  const months = cadence === 'annual' ? 12 : cadence === 'quarterly' ? 3 : 1
  const value = new Date(startIso)
  value.setUTCMonth(value.getUTCMonth() + months)
  return value.toISOString()
}

async function createSubscriptionPaymentLink(params: {
  square: SquareClient
  displayName: string
  cadence: 'monthly' | 'quarterly' | 'annual'
  locationId: string
  planVariationId: string
  priceCents: number
  currency: string
  redirectUrl: string
  order?: Record<string, unknown>
}) {
  const basePayload = {
    idempotencyKey: randomUUID(),
    quickPay: {
      name: `${params.displayName} (${params.cadence})`,
      locationId: params.locationId,
      subscriptionPlanId: params.planVariationId,
      priceMoney: {
        amount: BigInt(params.priceCents),
        currency: params.currency
      }
    },
    checkoutOptions: { redirectUrl: params.redirectUrl }
  }

  try {
    const withOrderPayload = params.order
      ? { ...basePayload, order: params.order }
      : basePayload

    const withOrder = await params.square.checkout.paymentLinks.create(
      withOrderPayload as never
    ) as SquarePaymentLinkResult

    return {
      result: withOrder,
      orderFallbackUsed: false,
      orderError: null as string | null
    }
  } catch (error) {
    const orderError = extractSquareErrorMessage(error)
    console.warn('[checkout-session] order metadata was rejected; retrying without order payload', {
      orderError
    })

    const withoutOrder = await params.square.checkout.paymentLinks.create(
      basePayload as never
    ) as SquarePaymentLinkResult

    return {
      result: withoutOrder,
      orderFallbackUsed: true,
      orderError
    }
  }
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  const userId = user?.sub && UUID_RE.test(user.sub) ? user.sub : null
  const supabase = serverSupabaseServiceRole(event)

  const parsed = bodySchema.parse(await readBody(event))
  const tierId = parsed.tier
  const cadence = parsed.cadence ?? 'monthly'
  const returnTo = normalizeReturnTo(parsed.returnTo)
  const guestEmail = normalizeEmail(parsed.guest_email)

  const { isAdmin } = await resolveServerUserRole(event, user)

  // ── 1) Validate tier exists and is accessible ──────────────────────────
  const { data: tier, error: tierErr } = await supabase
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

  // Hidden plan variations accessible to admins (e.g. test tier $0 plan)
  if (!variation.visible && !isAdmin) {
    throw createError({ statusCode: 400, statusMessage: 'Plan option not available' })
  }

  const isTestTier = tierId === 'test'
  let resolvedPlanVariationId: string | null = null

  if (isTestTier && !userId) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in to use the admin test tier' })
  }

  if (!isTestTier) {
    resolvedPlanVariationId = await resolvePlanVariationId(
      event,
      variation.provider_plan_variation_id,
      tierId,
      cadence
    )

    if (!resolvedPlanVariationId) {
      throw createError({
        statusCode: 503,
        statusMessage: 'This membership plan is not configured for checkout yet.'
      })
    }
  }

  const { origin } = getRequestURL(event)

  // ── 3a) Guest checkout (no auth required) ────────────────────────────────
  // Guests can complete payment first, then create/sign in to claim
  // the membership from /checkout/success.
  if (!userId) {
    if (!guestEmail) {
      throw createError({ statusCode: 400, statusMessage: 'Email is required to continue checkout.' })
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
        plan_variation_id: resolvedPlanVariationId
      })
      .select('id,token')
      .single()

    if (sessionErr || !checkoutSession) {
      throw createError({ statusCode: 500, statusMessage: sessionErr?.message ?? 'Failed to create checkout session' })
    }

    const session = checkoutSession as GuestCheckoutSessionInsertResult
    const square = await useSquareClient(event)
    const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
    const planVariationId = resolvedPlanVariationId as string
    const redirectUrl = `${origin}/checkout/success?checkout=${encodeURIComponent(session.token)}&returnTo=${encodeURIComponent(returnTo)}`

    let createRes: SquarePaymentLinkResult
    let orderFallbackUsed = false
    let orderError: string | null = null
    try {
      const created = await createSubscriptionPaymentLink({
        square,
        displayName: tier.display_name,
        cadence,
        locationId,
        planVariationId,
        priceCents: planPriceCents,
        currency: planCurrency,
        redirectUrl,
        order: {
          locationId,
          referenceId: session.id,
          metadata: {
            checkout_session_id: session.id,
            checkout_token: session.token,
            tier: tierId,
            cadence
          },
          buyerEmailAddress: guestEmail
        }
      })

      createRes = created.result
      orderFallbackUsed = created.orderFallbackUsed
      orderError = created.orderError
    } catch (error) {
      const errMsg = truncateErrorMessage(extractSquareErrorMessage(error))
      console.error('[checkout-session] failed to create guest subscription checkout link', {
        tierId,
        cadence,
        planVariationId,
        guestEmail,
        errMsg
      })
      await supabase
        .from('membership_checkout_sessions')
        .update({
          status: 'failed',
          metadata: {
            error: errMsg,
            order_fallback_used: orderFallbackUsed,
            order_error: orderError
          }
        })
        .eq('id', session.id)

      throw createError({
        statusCode: 502,
        statusMessage: `Failed to start secure checkout: ${errMsg}`
      })
    }

    const paymentLink = createRes.paymentLink
    if (!paymentLink?.url) {
      await supabase
        .from('membership_checkout_sessions')
        .update({
          status: 'failed',
          metadata: {
            error: 'missing_payment_link_url',
            order_fallback_used: orderFallbackUsed,
            order_error: orderError
          }
        })
        .eq('id', session.id)

      throw createError({ statusCode: 500, statusMessage: 'Square did not return a payment link URL' })
    }

    const { error: saveErr } = await supabase
      .from('membership_checkout_sessions')
      .update({
        payment_link_id: paymentLink.id ?? null,
        order_template_id: paymentLink.orderId ?? null,
        metadata: orderFallbackUsed
          ? {
              order_fallback_used: true,
              order_error: orderError
            }
          : null
      })
      .eq('id', session.id)

    if (saveErr) throw createError({ statusCode: 500, statusMessage: saveErr.message })

    return {
      redirectUrl: paymentLink.url,
      provider: 'square'
    }
  }

  // ── 3) Upsert membership row ─────────────────────────────────────────────
  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (memErr) throw createError({ statusCode: 500, statusMessage: memErr.message })

  // Allow re-checkout if previously active AND it's a test tier (so admins can re-run)
  if (membership?.status?.toLowerCase() === 'active' && !isTestTier) {
    throw createError({ statusCode: 409, statusMessage: 'Membership already active' })
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

  // ── Test tier: skip Square entirely, immediately confirm ─────────────────
  // This lets admins exercise the full UI flow without a real charge.
  if (isTestTier) {
    const periodStart = new Date().toISOString()
    const periodEnd = addCadenceMonths(periodStart, cadence)

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
      redirectUrl: `${origin}/checkout/success?test=1&returnTo=${encodeURIComponent(returnTo)}`,
      provider: 'test'
    }
  }

  // ── 4) Create Square payment link (real subscription checkout) ───────────
  const square = await useSquareClient(event)
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
  const redirectUrl = `${origin}/checkout/success?returnTo=${encodeURIComponent(returnTo)}`
  const planVariationId = resolvedPlanVariationId as string

  let createRes: SquarePaymentLinkResult
  try {
    const created = await createSubscriptionPaymentLink({
      square,
      displayName: tier.display_name,
      cadence,
      locationId,
      planVariationId,
      priceCents: planPriceCents,
      currency: planCurrency,
      redirectUrl,
      order: {
        locationId,
        referenceId: membershipId,
        metadata: {
          user_id: userId,
          membership_id: membershipId,
          tier: tierId,
          cadence
        },
        buyerEmailAddress: user?.email ?? undefined
      }
    })
    createRes = created.result
  } catch (error) {
    const errMsg = truncateErrorMessage(extractSquareErrorMessage(error))
    console.error('[checkout-session] failed to create member subscription checkout link', {
      tierId,
      cadence,
      planVariationId,
      userId,
      errMsg
    })
    throw createError({
      statusCode: 502,
      statusMessage: `Failed to start secure checkout: ${errMsg}`
    })
  }

  const paymentLink = (createRes as SquarePaymentLinkResult)?.paymentLink
  if (!paymentLink?.url) throw createError({ statusCode: 500, statusMessage: 'Square did not return a payment link URL' })

  // 5) Store checkout pointers
  const { error: saveErr } = await supabase
    .from('memberships')
    .update({
      checkout_provider: 'square',
      checkout_payment_link_id: paymentLink.id ?? null,
      checkout_order_template_id: paymentLink.orderId ?? null,
      square_plan_variation_id: planVariationId
    })
    .eq('id', membershipId)

  if (saveErr) throw createError({ statusCode: 500, statusMessage: saveErr.message })

  return {
    redirectUrl: paymentLink.url,
    provider: 'square'
  }
})
