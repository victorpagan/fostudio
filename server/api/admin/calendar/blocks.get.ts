import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const querySchema = z.object({
  activeOnly: z.coerce.boolean().optional().default(false)
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const query = querySchema.parse(getQuery(event))

  let builder = supabase
    .from('calendar_blocks')
    .select('id,start_time,end_time,reason,active,created_at,updated_at')
    .order('start_time', { ascending: true })

  if (query.activeOnly) builder = builder.eq('active', true)

  const { data, error } = await builder
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { blocks: data ?? [] }
})
