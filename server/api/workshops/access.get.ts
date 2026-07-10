import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { getServerConfigMap } from '~~/server/utils/config/secret'
import { isMembershipCurrentlyActive } from '~~/server/utils/membership/status'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const supabase = serverSupabaseServiceRole(event)
  const [customerResult, membershipResult, config] = await Promise.all([
    supabase
      .from('customers')
      .select('workshop_booking_enabled')
      .eq('user_id', user.sub)
      .maybeSingle(),
    supabase
      .from('memberships')
      .select('status,current_period_end,canceled_at')
      .eq('user_id', user.sub)
      .maybeSingle(),
    getServerConfigMap(event, ['workshop_credit_multiplier'])
  ])

  if (customerResult.error) throw createError({ statusCode: 500, statusMessage: customerResult.error.message })
  if (membershipResult.error) throw createError({ statusCode: 500, statusMessage: membershipResult.error.message })

  const accountEnabled = Boolean((customerResult.data as { workshop_booking_enabled?: boolean } | null)?.workshop_booking_enabled)
  const membershipEligible = isMembershipCurrentlyActive(membershipResult.data)

  return {
    workshopBookingEnabled: accountEnabled && membershipEligible,
    accountEnabled,
    membershipEligible,
    reason: !accountEnabled
      ? 'Workshop booking has not been enabled for this account.'
      : !membershipEligible
          ? 'Workshop booking requires an active membership.'
          : null,
    workshopCreditMultiplier: Math.max(1, Number(config.workshop_credit_multiplier ?? 2))
  }
})
