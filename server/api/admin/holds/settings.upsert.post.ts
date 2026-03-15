import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'

const bodySchema = z.object({
  holdCreditCost: z.number().int().min(0).max(50),
  minHoldBookingHours: z.number().int().min(1).max(24),
  holdMinEndHour: z.number().int().min(0).max(23),
  holdEndHour: z.number().int().min(0).max(23),
  holdTopupPriceCents: z.number().int().min(100).max(100000),
  holdTopupQuantity: z.number().int().min(1).max(50),
  holdTopupLabel: z.string().min(1).max(80)
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const rows = [
    { key: 'hold_credit_cost', value: body.holdCreditCost },
    { key: 'min_hold_booking_hours', value: body.minHoldBookingHours },
    { key: 'hold_min_end_hour', value: body.holdMinEndHour },
    { key: 'hold_end_hour', value: body.holdEndHour },
    { key: 'hold_topup_price_cents', value: body.holdTopupPriceCents },
    { key: 'hold_topup_quantity', value: body.holdTopupQuantity },
    { key: 'hold_topup_label', value: body.holdTopupLabel }
  ]

  const { error } = await supabase
    .from('system_config')
    .upsert(rows, { onConflict: 'key' })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  await refreshServerConfig()

  return { ok: true }
})
