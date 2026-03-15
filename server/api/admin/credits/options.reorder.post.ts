import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const optionOrderItemSchema = z.object({
  id: z.string().uuid(),
  sortOrder: z.number().int().min(0).max(10000)
})

const bodySchema = z.object({
  options: z.array(optionOrderItemSchema).min(1)
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))

  const updates = body.options.map((item) => (
    db
      .from('credit_pricing_options')
      .update({ sort_order: item.sortOrder })
      .eq('id', item.id)
  ))

  const results = await Promise.all(updates.map(update => update))
  for (const result of results) {
    if (result.error) {
      throw createError({ statusCode: 500, statusMessage: result.error.message })
    }
  }

  return {
    ok: true,
    updated: body.options.length
  }
})
