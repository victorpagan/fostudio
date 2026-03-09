import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { mapCreditOption } from '~~/server/utils/credits/topup'
import type { CreditPricingOptionRow } from '~~/server/utils/credits/topup'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const supabase = serverSupabaseServiceRole(event)
  const db = supabase as any

  const { data: membership, error: membershipErr } = await db
    .from('memberships')
    .select('id,status,tier')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membership || (membership.status ?? '').toLowerCase() !== 'active') {
    return {
      options: [],
      canPurchaseTopups: false,
      lockReason: 'active_membership_required'
    }
  }

  const { data, error } = await db
    .from('credit_pricing_options')
    .select('id,key,label,description,credits,base_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,active,sort_order,square_item_id,square_variation_id')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const now = new Date()
  const options = ((data ?? []) as CreditPricingOptionRow[]).map(row => mapCreditOption(row, now))
  return {
    options,
    canPurchaseTopups: true,
    lockReason: null
  }
})
