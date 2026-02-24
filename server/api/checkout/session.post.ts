// File: server/api/checkout/session.post.ts
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { serverSupabaseUser, serverSupabaseClient } from "#supabase/server"

const bodySchema = z.object({
  tier: z.string().min(1),
  cadence: z.enum(['monthly', 'quarterly', 'annual']).optional()
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const supabase = await serverSupabaseClient(event)

  const parsed = bodySchema.parse(await readBody(event))
  const tierId = parsed.tier
  const cadence = parsed.cadence ?? 'monthly'

  // 1) Validate tier exists and is visible/active
  const { data: tier, error: tierErr } = await supabase
    .from('membership_tiers')
    .select('id,display_name,active,visible')
    .eq('id', tierId)
    .maybeSingle()

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })
  if (!tier || !tier.active || !tier.visible) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid membership tier' })
  }

  // 2) Lookup Square plan variation for this tier/cadence from DB
  const { data: variation, error: varErr } = await supabase
    .from('membership_plan_variations')
    .select('provider,provider_plan_variation_id,active,visible')
    .eq('tier_id', tierId)
    .eq('cadence', cadence)
    .eq('provider', 'square')
    .maybeSingle()

  if (varErr) throw createError({ statusCode: 500, statusMessage: varErr.message })
  if (!variation || !variation.active || !variation.visible) {
    throw createError({ statusCode: 400, statusMessage: 'Plan option not available' })
  }

  const planVariationId = variation.provider_plan_variation_id

  // 3) Ensure membership row exists (you said signup may create it, but checkout should still work)
  const { data: membership, error: memErr } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (memErr) throw createError({ statusCode: 500, statusMessage: memErr.message })

  let membershipId: string
  if (!membership) {
    const { data: inserted, error: insErr } = await supabase
      .from('memberships')
      .insert({
        user_id: user.id,
        tier: tierId as 'creator' | 'pro' | 'studio_plus',
        cadence,
        status: 'pending_checkout' as const
      })
      .select('id')
      .single()

    if (insErr || !inserted) throw createError({ statusCode: 500, statusMessage: insErr?.message ?? 'Failed to create membership' })
    membershipId = inserted.id
  } else {
    // If already active, don’t start checkout again
    if ((membership.status || '').toLowerCase() === 'active') {
      throw createError({ statusCode: 409, statusMessage: 'Membership already active' })
    }

    // Update chosen tier/cadence for this checkout attempt
    const { error: updErr } = await supabase
      .from('memberships')
      .update({
        tier: tierId as 'creator' | 'pro' | 'studio_plus',
        cadence,
        status: 'pending_checkout' as const
      })
      .eq('id', membership.id)

    if (updErr) throw createError({ statusCode: 500, statusMessage: updErr.message })
    membershipId = membership.id
  }

  // 4) Create Square payment link (subscription checkout) using your Square util
  const square = await useSquareClient(event)

  const locationId = await getServerConfig(event, 'SQUARE_LOCATION_ID')
  const { origin } = getRequestURL(event)
  const redirectUrl = `${origin}/checkout/success`

  const idempotencyKey = randomUUID()

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
        user_id: user.id,
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
