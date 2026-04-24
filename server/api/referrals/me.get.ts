import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { ensureMemberReferralCode } from '~~/server/utils/referrals'

type ReferralRow = {
  id: string
  status: string
  rejection_reason: string | null
  referred_user_id: string | null
  referrer_credits_awarded: number
  created_at: string
  awarded_at: string | null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const supabase = serverSupabaseServiceRole(event) as any
  const codeRow = await ensureMemberReferralCode(supabase, user.sub)

  const { data: rows, error } = await supabase
    .from('membership_referrals')
    .select('id,status,rejection_reason,referred_user_id,referrer_credits_awarded,created_at,awarded_at')
    .eq('referrer_user_id', user.sub)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  const referrals = (rows ?? []) as ReferralRow[]

  const awarded = referrals.filter(row => row.status === 'awarded')
  const pending = referrals.filter(row => row.status === 'pending')
  const rejected = referrals.filter(row => row.status === 'rejected')
  const totalCreditsAwarded = awarded.reduce((sum, row) => sum + Number(row.referrer_credits_awarded ?? 0), 0)

  return {
    code: codeRow.code,
    active: Boolean(codeRow.active),
    stats: {
      awardedCount: awarded.length,
      pendingCount: pending.length,
      rejectedCount: rejected.length,
      totalCreditsAwarded: Number(totalCreditsAwarded.toFixed(2))
    },
    recent: referrals.slice(0, 12).map(row => ({
      id: row.id,
      status: row.status,
      rejectionReason: row.rejection_reason,
      referredUserId: row.referred_user_id,
      referrerCreditsAwarded: Number(row.referrer_credits_awarded ?? 0),
      createdAt: row.created_at,
      awardedAt: row.awarded_at
    }))
  }
})
