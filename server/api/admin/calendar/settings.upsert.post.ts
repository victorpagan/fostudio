import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'

const bodySchema = z.object({
  peakDays: z.array(z.number().int().min(1).max(7)).min(1),
  peakStartHour: z.number().int().min(0).max(23),
  peakEndHour: z.number().int().min(1).max(24),
  guestPeakMultiplier: z.number().min(1).max(5),
  guestBookingWindowDays: z.number().int().min(1).max(60)
}).refine((value) => value.peakEndHour > value.peakStartHour, {
  message: 'Peak end hour must be after start hour',
  path: ['peakEndHour']
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const rows = [
    { key: 'peak_days', value: body.peakDays },
    { key: 'peak_start_hour', value: body.peakStartHour },
    { key: 'peak_end_hour', value: body.peakEndHour },
    { key: 'guest_peak_multiplier', value: body.guestPeakMultiplier },
    { key: 'guest_booking_window_days', value: body.guestBookingWindowDays }
  ]

  const { error } = await supabase
    .from('system_config')
    .upsert(rows, { onConflict: 'key' })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  await refreshServerConfig()

  return { ok: true }
})
