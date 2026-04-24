import { requireServerAdmin } from '~~/server/utils/auth'
import { defaultReferralCredits } from '~~/server/utils/referrals'

type ReferralRuleRow = {
  tier_id: string | null
  cadence: string | null
  referrer_credits: number | null
  referred_credits: number | null
}

type VariationRow = {
  tier_id: string | null
  cadence: string | null
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)

  const { data, error } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', ['credit_expiry_days', 'credit_rollover_max_multiplier', 'workshop_credit_multiplier'])

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  const map = new Map((data ?? []).map(row => [row.key, row.value] as const))

  const { data: referralRules, error: referralRulesErr } = await supabase
    .from('referral_credit_rules' as never)
    .select('tier_id,cadence,referrer_credits,referred_credits')
    .order('tier_id', { ascending: true })
    .order('cadence', { ascending: true })
  if (referralRulesErr) throw createError({ statusCode: 500, statusMessage: referralRulesErr.message })

  let resolvedRules = ((referralRules ?? []) as unknown as ReferralRuleRow[]).map(row => ({
    tierId: String(row.tier_id),
    cadence: String(row.cadence),
    referrerCredits: Number(row.referrer_credits ?? 0),
    referredCredits: Number(row.referred_credits ?? 0)
  }))

  if (!resolvedRules.length) {
    const { data: variations, error: variationsErr } = await supabase
      .from('membership_plan_variations')
      .select('tier_id,cadence')
      .eq('provider', 'square')
      .order('tier_id', { ascending: true })
      .order('cadence', { ascending: true })
    if (variationsErr) throw createError({ statusCode: 500, statusMessage: variationsErr.message })
    resolvedRules = ((variations ?? []) as VariationRow[]).map((row) => {
      const tierId = String(row.tier_id ?? '')
      const cadence = String(row.cadence ?? '')
      const fallback = defaultReferralCredits(tierId, cadence)
      return {
        tierId,
        cadence,
        referrerCredits: fallback,
        referredCredits: fallback
      }
    })
  }

  return {
    settings: {
      creditExpiryDays: Number(map.get('credit_expiry_days') ?? 90),
      creditRolloverMaxMultiplier: Number(map.get('credit_rollover_max_multiplier') ?? 2),
      workshopCreditMultiplier: Number(map.get('workshop_credit_multiplier') ?? 2),
      referralRules: resolvedRules
    }
  }
})
