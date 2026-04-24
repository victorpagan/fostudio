import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { getServerConfigMap } from '~~/server/utils/config/secret'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const supabase = serverSupabaseServiceRole(event) as any
  const [customerResult, config] = await Promise.all([
    supabase
      .from('customers')
      .select('workshop_booking_enabled')
      .eq('user_id', user.sub)
      .maybeSingle(),
    getServerConfigMap(event, ['workshop_credit_multiplier'])
  ])

  if (customerResult.error) throw createError({ statusCode: 500, statusMessage: customerResult.error.message })

  return {
    workshopBookingEnabled: Boolean((customerResult.data as { workshop_booking_enabled?: boolean } | null)?.workshop_booking_enabled),
    workshopCreditMultiplier: Math.max(1, Number(config.workshop_credit_multiplier ?? 2))
  }
})
