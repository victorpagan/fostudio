import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'

const bodySchema = z.object({
  peakDays: z.array(z.number().int().min(1).max(7)).min(1),
  peakStartHour: z.number().int().min(0).max(23),
  peakEndHour: z.number().int().min(1).max(24),
  guestPeakMultiplier: z.number().min(1).max(5),
  guestBookingWindowDays: z.number().int().min(1).max(60),
  guestBookingStartHour: z.number().int().min(0).max(23),
  guestBookingEndHour: z.number().int().min(1).max(24),
  memberRescheduleNoticeHours: z.number().int().min(1).max(240)
}).refine(value => value.peakEndHour > value.peakStartHour, {
  message: 'Peak end hour must be after start hour',
  path: ['peakEndHour']
}).refine(value => value.guestBookingEndHour > value.guestBookingStartHour, {
  message: 'Guest booking end hour must be after start hour',
  path: ['guestBookingEndHour']
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const rows = [
    { key: 'peak_days', value: body.peakDays },
    { key: 'peak_start_hour', value: body.peakStartHour },
    { key: 'peak_end_hour', value: body.peakEndHour },
    { key: 'guest_peak_multiplier', value: body.guestPeakMultiplier },
    { key: 'guest_booking_window_days', value: body.guestBookingWindowDays },
    { key: 'guest_booking_start_hour', value: body.guestBookingStartHour },
    { key: 'guest_booking_end_hour', value: body.guestBookingEndHour },
    { key: 'member_reschedule_notice_hours', value: body.memberRescheduleNoticeHours }
  ]

  const { error } = await supabase
    .from('system_config')
    .upsert(rows, { onConflict: 'key' })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  await refreshServerConfig()

  return { ok: true }
})
