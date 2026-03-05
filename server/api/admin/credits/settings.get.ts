import { requireServerAdmin } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const { data, error } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', ['credit_expiry_days', 'credit_rollover_max_multiplier'])

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  const map = new Map((data ?? []).map(row => [row.key, row.value] as const))

  return {
    settings: {
      creditExpiryDays: Number(map.get('credit_expiry_days') ?? 90),
      creditRolloverMaxMultiplier: Number(map.get('credit_rollover_max_multiplier') ?? 2)
    }
  }
})
