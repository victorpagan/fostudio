import { serverSupabaseServiceRole } from '#supabase/server'

const DEFAULT_MEMBER_RESCHEDULE_NOTICE_HOURS = 24
const DEFAULT_HOLD_CREDIT_COST = 2

export default defineEventHandler(async (event) => {
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', ['member_reschedule_notice_hours', 'hold_credit_cost'])

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const map = new Map((data ?? []).map(row => [row.key, row.value] as const))

  return {
    memberRescheduleNoticeHours: Number(map.get('member_reschedule_notice_hours') ?? DEFAULT_MEMBER_RESCHEDULE_NOTICE_HOURS),
    holdCreditCost: Number(map.get('hold_credit_cost') ?? DEFAULT_HOLD_CREDIT_COST)
  }
})
