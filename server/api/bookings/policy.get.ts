import { serverSupabaseServiceRole } from '#supabase/server'
import { DEFAULT_HOLD_END_HOUR, DEFAULT_HOLD_MIN_END_HOUR, DEFAULT_MIN_HOLD_BOOKING_HOURS } from '~~/server/utils/booking/holds'

const DEFAULT_MEMBER_RESCHEDULE_NOTICE_HOURS = 24
const DEFAULT_HOLD_CREDIT_COST = 2
const DEFAULT_PEAK_START_HOUR = 11

export default defineEventHandler(async (event) => {
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', [
      'member_reschedule_notice_hours',
      'hold_credit_cost',
      'min_hold_booking_hours',
      'hold_min_end_hour',
      'hold_end_hour',
      'peak_start_hour',
      'workshop_credit_multiplier'
    ])

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const map = new Map((data ?? []).map(row => [row.key, row.value] as const))

  return {
    memberRescheduleNoticeHours: Number(map.get('member_reschedule_notice_hours') ?? DEFAULT_MEMBER_RESCHEDULE_NOTICE_HOURS),
    holdCreditCost: Number(map.get('hold_credit_cost') ?? DEFAULT_HOLD_CREDIT_COST),
    minHoldBookingHours: Number(map.get('min_hold_booking_hours') ?? DEFAULT_MIN_HOLD_BOOKING_HOURS),
    holdMinEndHour: Number(map.get('hold_min_end_hour') ?? DEFAULT_HOLD_MIN_END_HOUR),
    holdEndHour: Number(map.get('hold_end_hour') ?? DEFAULT_HOLD_END_HOUR),
    peakStartHour: Number(map.get('peak_start_hour') ?? DEFAULT_PEAK_START_HOUR),
    workshopCreditMultiplier: Number(map.get('workshop_credit_multiplier') ?? 2)
  }
})
