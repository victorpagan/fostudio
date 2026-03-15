import { requireServerAdmin } from '~~/server/utils/auth'
import { DEFAULT_HOLD_END_HOUR, DEFAULT_HOLD_MIN_END_HOUR } from '~~/server/utils/booking/holds'

const SETTINGS_KEYS = [
  'hold_credit_cost',
  'min_hold_booking_hours',
  'hold_min_end_hour',
  'hold_end_hour',
  'hold_topup_price_cents',
  'hold_topup_quantity',
  'hold_topup_label',
  'hold_topup_square_item_id',
  'hold_topup_square_variation_id'
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
      holdCreditCost: Number(map.get('hold_credit_cost') ?? 2),
      minHoldBookingHours: Number(map.get('min_hold_booking_hours') ?? 4),
      holdMinEndHour: Number(map.get('hold_min_end_hour') ?? DEFAULT_HOLD_MIN_END_HOUR),
      holdEndHour: Number(map.get('hold_end_hour') ?? DEFAULT_HOLD_END_HOUR),
      holdTopupPriceCents: Number(map.get('hold_topup_price_cents') ?? 2500),
      holdTopupQuantity: Number(map.get('hold_topup_quantity') ?? 1),
      holdTopupLabel: typeof map.get('hold_topup_label') === 'string' ? String(map.get('hold_topup_label')) : 'Overnight hold add-on',
      holdTopupSquareItemId: typeof map.get('hold_topup_square_item_id') === 'string' ? String(map.get('hold_topup_square_item_id')) : '',
      holdTopupSquareVariationId: typeof map.get('hold_topup_square_variation_id') === 'string' ? String(map.get('hold_topup_square_variation_id')) : ''
    }
  }
})
