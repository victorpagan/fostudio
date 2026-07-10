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
  'guest_min_booking_hours',
  'guest_booking_increment_minutes',
  'guest_credit_expiry_days',
  'guest_pending_payment_hold_minutes',
  'standby_enabled',
  'standby_min_open_slot_hours',
  'standby_discount_multiplier',
  'member_standby_start_hour',
  'member_standby_window_hours',
  'guest_standby_window_hours',
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
      guestPeakMultiplier: Number(map.get('guest_peak_multiplier') ?? 2.5),
      guestBookingRatePerCreditCents: Number(map.get('guest_booking_rate_per_credit_cents') ?? 3500),
      guestBookingWindowDays: Number(map.get('guest_booking_window_days') ?? 20),
      guestBookingStartHour: Number(map.get('guest_booking_start_hour') ?? 9),
      guestBookingEndHour: Number(map.get('guest_booking_end_hour') ?? 21),
      guestMinBookingHours: Number(map.get('guest_min_booking_hours') ?? 2),
      guestBookingIncrementMinutes: Number(map.get('guest_booking_increment_minutes') ?? 60),
      guestCreditExpiryDays: Number(map.get('guest_credit_expiry_days') ?? 30),
      guestPendingPaymentHoldMinutes: Number(map.get('guest_pending_payment_hold_minutes') ?? 15),
      standbyEnabled: map.get('standby_enabled') !== false,
      standbyMinOpenSlotHours: Number(map.get('standby_min_open_slot_hours') ?? 4),
      standbyDiscountMultiplier: Number(map.get('standby_discount_multiplier') ?? 0.5),
      memberStandbyStartHour: Number(map.get('member_standby_start_hour') ?? 8),
      memberStandbyWindowHours: Number(map.get('member_standby_window_hours') ?? 10),
      guestStandbyWindowHours: Number(map.get('guest_standby_window_hours') ?? 6),
      memberRescheduleNoticeHours: Number(map.get('member_reschedule_notice_hours') ?? 24)
    }
  }
})
