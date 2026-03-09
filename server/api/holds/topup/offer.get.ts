import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

const DEFAULT_HOLD_TOPUP_LABEL = 'Overnight hold add-on'
const DEFAULT_HOLD_TOPUP_PRICE_CENTS = 2500
const DEFAULT_HOLD_TOPUP_QUANTITY = 1

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const supabase = serverSupabaseServiceRole(event)

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,status')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membership || (membership.status ?? '').toLowerCase() !== 'active') {
    return { offer: null }
  }

  const { data: configRows, error: configErr } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', ['hold_topup_label', 'hold_topup_price_cents', 'hold_topup_quantity'])

  if (configErr) throw createError({ statusCode: 500, statusMessage: configErr.message })

  const config = new Map<string, unknown>()
  for (const row of configRows ?? []) {
    config.set(String(row.key), row.value)
  }

  const label = typeof config.get('hold_topup_label') === 'string'
    ? String(config.get('hold_topup_label'))
    : DEFAULT_HOLD_TOPUP_LABEL
  const amountCents = Number(config.get('hold_topup_price_cents') ?? DEFAULT_HOLD_TOPUP_PRICE_CENTS)
  const holds = Number(config.get('hold_topup_quantity') ?? DEFAULT_HOLD_TOPUP_QUANTITY)

  if (!Number.isFinite(amountCents) || amountCents <= 0 || !Number.isFinite(holds) || holds <= 0) {
    return { offer: null }
  }

  return {
    offer: {
      label,
      holds: Math.floor(holds),
      amountCents: Math.floor(amountCents),
      currency: 'USD'
    }
  }
})
