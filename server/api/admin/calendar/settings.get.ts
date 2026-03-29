import { requireServerAdmin } from '~~/server/utils/auth'

const SETTINGS_KEYS = [
  'peak_days',
  'peak_start_hour',
  'peak_end_hour',
  'guest_peak_multiplier',
  'guest_booking_rate_per_credit_cents',
  'guest_booking_window_days',
  'guest_booking_start_hour',
  'guest_booking_end_hour',
  'member_reschedule_notice_hours'
] as const

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)

  const { data, error } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', [...SETTINGS_KEYS])

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const map = new Map((data ?? []).map(row => [row.key, row.value] as const))

  return {
    settings: {
      peakDays: Array.isArray(map.get('peak_days')) ? map.get('peak_days') : [1, 2, 3, 4],
      peakStartHour: Number(map.get('peak_start_hour') ?? 11),
      peakEndHour: Number(map.get('peak_end_hour') ?? 16),
      guestPeakMultiplier: Number(map.get('guest_peak_multiplier') ?? 2),
      guestBookingRatePerCreditCents: Number(map.get('guest_booking_rate_per_credit_cents') ?? 3500),
      guestBookingWindowDays: Number(map.get('guest_booking_window_days') ?? 7),
      guestBookingStartHour: Number(map.get('guest_booking_start_hour') ?? 11),
      guestBookingEndHour: Number(map.get('guest_booking_end_hour') ?? 19),
      memberRescheduleNoticeHours: Number(map.get('member_reschedule_notice_hours') ?? 24)
    }
  }
})
