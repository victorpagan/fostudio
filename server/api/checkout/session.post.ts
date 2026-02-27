// File: server/api/checkout/session.post.ts
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

const bodySchema = z.object({
  tier: z.string().min(1),
  cadence: z.enum(['monthly', 'quarterly', 'annual']).optional()
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  // serverSupabaseUser returns JwtPayload in @nuxtjs/supabase v2; the UUID is in `.sub`
  const user = await serverSupabaseUser(event)
  if (!user?.sub || !UUID_RE.test(user.sub)) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const supabase = await serverSupabaseClient(event)

  const parsed = bodySchema.parse(await readBody(event))
  const tierId = parsed.tier
  const cadence = parsed.cadence ?? 'monthly'

  // Derive user role from JWT (check user_metadata first, then app_metadata for backend-only security)
  const role = (user as any).user_metadata?.role ?? (user as any).app_metadata?.role as string | undefined
  const isAdmin = role === 'admin' || role === 'service'

  // ── 1) Validate tier exists and is accessible ──────────────────────────
  const { data: tier, error: tierErr } = await supabase
    .from('membership_tiers')
    .select('id,display_name,active,visible')
    .eq('id', tierId)
    .maybeSingle()

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })
  if (!tier || !tier.active) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid membership tier' })
  }

  // Hidden tiers (e.g. 'test') are admin-only
  if (!tier.visible && !isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Access denied' })
  }

  // ── 2) Lookup plan variation ─────────────────────────────────────────────
  const { data: variation, error: varErr } = await supabase
    .from('membership_plan_variations')
    .select('provider,provider_plan_variation_id,active,visible,price_cents')
    .eq('tier_id', tierId)
    .eq('cadence', cadence)
    .eq('provider', 'square')
    .maybeSingle()

  if (varErr) throw createError({ statusCode: 500, statusMessage: varErr.message })
  if (!variation || !variation.active) {
    throw createError({ statusCode: 400, statusMessage: 'Plan option not available' })
  }

  // Hidden plan variations accessible to admins (e.g. test tier $0 plan)
  if (!variation.visible && !isAdmin) {
    throw createError({ statusCode: 400, statusMessage: 'Plan option not available' })
  }

  // ── 3) Upsert membership row ─────────────────────────────────────────────
  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (memErr) throw createError({ statusCode: 500, statusMessage: memErr.message })

  // Allow re-checkout if previously active AND it's a test tier (so admins can re-run)
  const isTestTier = tierId === 'test'
  if (membership?.status?.toLowerCase() === 'active' && !isTestTier) {
    throw createError({ statusCode: 409, statusMessage: 'Membership already active' })
  }

  let membershipId: string
  if (!membership) {
    const { data: inserted, error: insErr } = await supabase
      .from('memberships')
      .insert({
        user_id: user.sub,
        tier: tierId,
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
        tier: tierId,
        cadence,
        status: 'pending_checkout' as const
      })
      .eq('id', membership.id)

    if (updErr) throw createError({ statusCode: 500, statusMessage: updErr.message })
    membershipId = membership.id
  }

  const { origin } = getRequestURL(event)

  // ── Test tier: skip Square entirely, immediately confirm ─────────────────
  // This lets admins exercise the full UI flow without a real charge.
  if (isTestTier) {
    const { error: confirmErr } = await supabase
      .from('memberships')
      .update({
        status: 'active',
        checkout_provider: 'test',
        updated_at: new Date().toISOString()
      })
      .eq('id', membershipId)

    if (confirmErr) throw createError({ statusCode: 500, statusMessage: confirmErr.message })

    console.log(`[checkout] Test tier activated for user ${user.sub}, membership ${membershipId}`)

    return {
      redirectUrl: `${origin}/checkout/success?test=1`,
      provider: 'test'
    }
  }

  // ── 4) Create Square payment link (real subscription checkout) ───────────
  const square = await useSquareClient(event)
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
  const redirectUrl = `${origin}/checkout/success`
  const idempotencyKey = randomUUID()
  const planVariationId = variation.provider_plan_variation_id

  const createRes = await square.checkout.paymentLinks.create({
    idempotencyKey,
    quickPay: {
      name: `${tier.display_name} (${cadence})`,
      locationId,
      subscriptionPlanId: planVariationId
    },
    checkoutOptions: {
      redirectUrl
    },
    order: {
      locationId,
      referenceId: membershipId,
      metadata: {
        user_id: user.sub,
        membership_id: membershipId,
        tier: tierId,
        cadence
      }
    }
  } as any)

  const paymentLink = (createRes as any)?.paymentLink
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
