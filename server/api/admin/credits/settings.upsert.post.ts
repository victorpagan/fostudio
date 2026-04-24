import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'
import { defaultReferralCredits } from '~~/server/utils/referrals'

const bodySchema = z.object({
  creditExpiryDays: z.number().int().min(0).max(3650),
  creditRolloverMaxMultiplier: z.number().min(0.5).max(20),
  workshopCreditMultiplier: z.number().min(1).max(20),
  referralRules: z.array(z.object({
    tierId: z.string().min(1).max(120),
    cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual']),
    referrerCredits: z.number().min(0).max(500),
    referredCredits: z.number().min(0).max(500)
  })).optional()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const { error } = await supabase
    .from('system_config')
    .upsert([
      { key: 'credit_expiry_days', value: body.creditExpiryDays },
      { key: 'credit_rollover_max_multiplier', value: body.creditRolloverMaxMultiplier },
      { key: 'workshop_credit_multiplier', value: body.workshopCreditMultiplier }
    ], { onConflict: 'key' })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const rulesToPersist = body.referralRules ?? []
  if (rulesToPersist.length) {
    const normalized = rulesToPersist.map(rule => ({
      tier_id: rule.tierId.trim(),
      cadence: rule.cadence,
      referrer_credits: Number.isFinite(rule.referrerCredits)
        ? Number(rule.referrerCredits)
        : defaultReferralCredits(rule.tierId, rule.cadence),
      referred_credits: Number.isFinite(rule.referredCredits)
        ? Number(rule.referredCredits)
        : defaultReferralCredits(rule.tierId, rule.cadence)
    }))

    const { error: rulesErr } = await supabase
      .from('referral_credit_rules' as never)
      .upsert(normalized as never, { onConflict: 'tier_id,cadence' })
    if (rulesErr) throw createError({ statusCode: 500, statusMessage: rulesErr.message })
  }

  await refreshServerConfig()

  return { ok: true }
})
