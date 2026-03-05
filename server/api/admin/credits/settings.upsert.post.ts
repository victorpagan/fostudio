import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'

const bodySchema = z.object({
  creditExpiryDays: z.number().int().min(0).max(3650),
  creditRolloverMaxMultiplier: z.number().min(0.5).max(20)
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const { error } = await supabase
    .from('system_config')
    .upsert([
      { key: 'credit_expiry_days', value: body.creditExpiryDays },
      { key: 'credit_rollover_max_multiplier', value: body.creditRolloverMaxMultiplier }
    ], { onConflict: 'key' })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  await refreshServerConfig()

  return { ok: true }
})
