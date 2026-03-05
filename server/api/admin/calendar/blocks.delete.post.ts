import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  id: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const { error } = await supabase
    .from('calendar_blocks')
    .delete()
    .eq('id', body.id)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
