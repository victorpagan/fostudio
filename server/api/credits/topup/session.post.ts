import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { getCreditOptionEffectivePriceCents, mapCreditOption } from '~~/server/utils/credits/topup'
import type { CreditPricingOptionRow } from '~~/server/utils/credits/topup'

const bodySchema = z.object({
  optionKey: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event))

  const supabase = serverSupabaseServiceRole(event)
  const db = supabase as any

  const { data: rawOption, error: optionErr } = await db
    .from('credit_pricing_options')
    .select('id,key,label,description,credits,base_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,active,sort_order,square_item_id,square_variation_id')
    .eq('key', body.optionKey)
    .eq('active', true)
    .maybeSingle()

  if (optionErr) throw createError({ statusCode: 500, statusMessage: optionErr.message })
  if (!rawOption) throw createError({ statusCode: 400, statusMessage: 'Invalid credit option' })

  const option = rawOption as CreditPricingOptionRow
  const effectivePriceCents = getCreditOptionEffectivePriceCents(option)
  const mappedOption = mapCreditOption(option)

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,status,tier')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membership || (membership.status ?? '').toLowerCase() !== 'active') {
    throw createError({
      statusCode: 403,
      statusMessage: 'An active membership is required before purchasing additional credits.'
    })
  }

  const token = randomUUID()
  const { data: topupSession, error: topupErr } = await db
    .from('credit_topup_sessions')
    .insert({
      token,
      user_id: user.sub,
      membership_id: membership.id,
      credits: mappedOption.credits,
      amount_cents: effectivePriceCents,
      currency: 'USD',
      status: 'pending',
      payment_provider: 'square',
      metadata: {
        option_id: mappedOption.id,
        option_key: mappedOption.key,
        option_label: mappedOption.label,
        base_price_cents: mappedOption.basePriceCents,
        effective_price_cents: effectivePriceCents,
        sale_active: mappedOption.saleActive
      }
    })
    .select('id,token')
    .single()

  if (topupErr || !topupSession) {
    throw createError({ statusCode: 500, statusMessage: topupErr?.message ?? 'Failed to create credit checkout session' })
  }

  return {
    provider: 'square_web_payments',
    topupToken: topupSession.token,
    amountCents: effectivePriceCents,
    currency: 'USD',
    credits: mappedOption.credits,
    label: mappedOption.label
  }
})
