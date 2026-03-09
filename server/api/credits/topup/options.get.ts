import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { mapCreditOption } from '~~/server/utils/credits/topup'
import type { CreditPricingOptionRow } from '~~/server/utils/credits/topup'
import { computeCreditBucketSummary } from '~~/server/utils/credits/buckets'

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

  const { data: tierRow, error: tierErr } = await db
    .from('membership_tiers')
    .select('max_bank')
    .eq('id', membership.tier)
    .maybeSingle()
  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })

  const { data: ledgerRows, error: ledgerErr } = await db
    .from('credits_ledger')
    .select('id,delta,reason,expires_at,created_at')
    .eq('user_id', user.sub)
  if (ledgerErr) throw createError({ statusCode: 500, statusMessage: ledgerErr.message })

  const bucketSummary = computeCreditBucketSummary(ledgerRows ?? [])
  const maxBank = Number(tierRow?.max_bank ?? 0)
  const canPurchaseTopups = maxBank <= 0 || bucketSummary.bankBalance >= maxBank
  if (!canPurchaseTopups) {
    return {
      options: [],
      canPurchaseTopups: false,
      lockReason: 'plan_bank_not_at_cap',
      bankBalance: bucketSummary.bankBalance,
      maxBank
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
    lockReason: null,
    bankBalance: bucketSummary.bankBalance,
    maxBank
  }
})
