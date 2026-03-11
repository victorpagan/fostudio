import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { normalizePromoCode, resolvePromoPricing } from '~~/server/utils/promos'

const DEFAULT_HOLD_TOPUP_LABEL = 'Overnight hold add-on'
const DEFAULT_HOLD_TOPUP_PRICE_CENTS = 2500
const DEFAULT_HOLD_TOPUP_QUANTITY = 1
const bodySchema = z.object({
  promo_code: z.string().min(2).max(64).optional()
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const supabase = serverSupabaseServiceRole(event)
  const rawBody = await readBody(event).catch(() => ({}))
  const body = bodySchema.parse(rawBody ?? {})

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,status')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membership || (membership.status ?? '').toLowerCase() !== 'active') {
    throw createError({ statusCode: 403, statusMessage: 'An active membership is required before purchasing holds.' })
  }

  const { data: configRows, error: configErr } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', [
      'hold_topup_label',
      'hold_topup_price_cents',
      'hold_topup_quantity',
      'hold_topup_square_item_id',
      'hold_topup_square_variation_id'
    ])

  if (configErr) throw createError({ statusCode: 500, statusMessage: configErr.message })

  const config = new Map<string, unknown>()
  for (const row of configRows ?? []) {
    config.set(String(row.key), row.value)
  }

  const label = typeof config.get('hold_topup_label') === 'string'
    ? String(config.get('hold_topup_label'))
    : DEFAULT_HOLD_TOPUP_LABEL
  const amountCents = Math.floor(Number(config.get('hold_topup_price_cents') ?? DEFAULT_HOLD_TOPUP_PRICE_CENTS))
  const holds = Math.floor(Number(config.get('hold_topup_quantity') ?? DEFAULT_HOLD_TOPUP_QUANTITY))
  if (!Number.isFinite(amountCents) || amountCents <= 0 || !Number.isFinite(holds) || holds <= 0) {
    throw createError({ statusCode: 503, statusMessage: 'Hold top-up is not configured.' })
  }

  const promoCode = normalizePromoCode(body.promo_code)
  const promoPricing = await resolvePromoPricing({
    supabase,
    promoCode,
    context: 'holds',
    basePriceCents: amountCents
  })
  const effectiveAmountCents = promoPricing?.effectivePriceCents ?? amountCents

  const token = randomUUID()
  const { data: topupSession, error: topupErr } = await supabase
    .from('hold_topup_sessions')
    .insert({
      token,
      user_id: user.sub,
      membership_id: membership.id,
      holds,
      amount_cents: effectiveAmountCents,
      currency: 'USD',
      status: 'pending',
      payment_provider: 'square',
      metadata: {
        label,
        holds,
        amount_cents: effectiveAmountCents,
        base_amount_cents: amountCents,
        promo_code: promoPricing?.code ?? null,
        promo_id: promoPricing?.promoId ?? null,
        promo_discount_cents: promoPricing?.discountCents ?? null,
        promo_square_discount_id: promoPricing?.squareDiscountId ?? null
      }
    })
    .select('id,token')
    .single()

  if (topupErr || !topupSession) {
    throw createError({ statusCode: 500, statusMessage: topupErr?.message ?? 'Failed to create hold checkout session' })
  }

  return {
    provider: 'square_web_payments',
    topupToken: topupSession.token,
    amountCents: effectiveAmountCents,
    currency: 'USD',
    holds,
    label,
    promo: promoPricing
      ? {
          code: promoPricing.code,
          discountCents: promoPricing.discountCents
        }
      : null
  }
})
