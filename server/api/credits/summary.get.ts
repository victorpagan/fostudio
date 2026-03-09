import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import {
  computeCreditBucketSummary,
  DEFAULT_MEMBERSHIP_CREDIT_EXPIRY_DAYS,
  DEFAULT_TOPUP_CREDIT_EXPIRY_DAYS
} from '~~/server/utils/credits/buckets'

function isSchemaMissingColumnError(message: string) {
  return /column .* does not exist/i.test(message) || /relation .* does not exist/i.test(message)
}

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

  const hasActiveMembership = Boolean(membership && (membership.status ?? '').toLowerCase() === 'active')

  if (hasActiveMembership) {
    try {
      await db.rpc('process_due_membership_credit_grants', {
        p_limit: 24
      })
    } catch (error) {
      console.error('[credits-summary] grant refresh failed', error)
    }
  }

  let tierRow: { max_bank?: number, credit_expiry_days?: number, topoff_credit_expiry_days?: number } | null = null
  let tierErr: { message: string } | null = null

  if (membership?.tier) {
    const tierRes = await db
      .from('membership_tiers')
      .select('max_bank,credit_expiry_days,topoff_credit_expiry_days')
      .eq('id', membership.tier)
      .maybeSingle()

    tierRow = tierRes.data
    tierErr = tierRes.error
  }

  if (tierErr && isSchemaMissingColumnError(tierErr.message)) {
    const fallback = membership?.tier
      ? await db
          .from('membership_tiers')
          .select('max_bank')
          .eq('id', membership.tier)
          .maybeSingle()
      : { data: null, error: null }
    tierRow = fallback.data
    tierErr = fallback.error
  }

  if (tierErr) throw createError({ statusCode: 500, statusMessage: tierErr.message })

  const { data: ledgerRows, error: ledgerErr } = await db
    .from('credits_ledger')
    .select('id,delta,reason,expires_at,created_at')
    .eq('user_id', user.sub)
  if (ledgerErr) throw createError({ statusCode: 500, statusMessage: ledgerErr.message })

  const summary = computeCreditBucketSummary(ledgerRows ?? [])
  const maxBank = Number(tierRow?.max_bank ?? 0)
  const canBuyTopoff = hasActiveMembership
  const overCap = maxBank > 0 && summary.bankBalance > maxBank
  const atCap = maxBank > 0 && summary.bankBalance >= maxBank

  const membershipCreditExpiryDays = Number(tierRow?.credit_expiry_days ?? DEFAULT_MEMBERSHIP_CREDIT_EXPIRY_DAYS)
  const topoffCreditExpiryDays = Number(tierRow?.topoff_credit_expiry_days ?? DEFAULT_TOPUP_CREDIT_EXPIRY_DAYS)

  return {
    summary: {
      totalBalance: summary.totalBalance,
      bankBalance: summary.bankBalance,
      topoffBalance: summary.topoffBalance,
      expiringSoonCredits: summary.expiringSoonCredits,
      expiringSoonAt: summary.expiringSoonAt,
      maxBank,
      atCap,
      overCap,
      canBuyTopoff,
      membershipCreditExpiryDays: Number.isFinite(membershipCreditExpiryDays) && membershipCreditExpiryDays > 0
        ? Math.floor(membershipCreditExpiryDays)
        : DEFAULT_MEMBERSHIP_CREDIT_EXPIRY_DAYS,
      topoffCreditExpiryDays: Number.isFinite(topoffCreditExpiryDays) && topoffCreditExpiryDays > 0
        ? Math.floor(topoffCreditExpiryDays)
        : DEFAULT_TOPUP_CREDIT_EXPIRY_DAYS
    }
  }
})
