import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const paramsSchema = z.object({
  id: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const params = paramsSchema.parse(getRouterParams(event))

  const { error } = await db
    .from('promo_codes')
    .delete()
    .eq('id', params.id)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
