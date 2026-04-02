import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'

const bodySchema = z.object({
  permanentCodesDisarmAbodeOutsideLabHours: z.boolean()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const { error } = await supabase
    .from('system_config')
    .upsert([
      {
        key: 'PERMANENT_CODES_DISARM_ABODE_OUTSIDE_LAB_HOURS',
        value: body.permanentCodesDisarmAbodeOutsideLabHours
      }
    ], { onConflict: 'key' })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  await refreshServerConfig()

  return { ok: true }
})
