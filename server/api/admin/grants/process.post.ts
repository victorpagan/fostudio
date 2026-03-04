import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  limit: z.number().int().positive().max(500).optional()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse((await readBody(event).catch(() => ({}))) ?? {})

  const { data, error } = await supabase.rpc('process_due_membership_credit_grants', {
    p_limit: body.limit ?? 200
  })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    result: Array.isArray(data) ? (data[0] ?? null) : null
  }
})
