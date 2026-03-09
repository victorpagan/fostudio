import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const tierOrderItemSchema = z.object({
  tierId: z.string().min(2).max(48).regex(/^[a-z][a-z0-9_]*$/),
  sortOrder: z.number().int().min(0).max(10000)
})

const bodySchema = z.object({
  tiers: z.array(tierOrderItemSchema).min(1)
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const updates = body.tiers.map((item) => (
    supabase
      .from('membership_tiers')
      .update({ sort_order: item.sortOrder })
      .eq('id', item.tierId)
  ))

  const results = await Promise.all(updates.map(update => update))
  for (const result of results) {
    if (result.error) {
      throw createError({ statusCode: 500, statusMessage: result.error.message })
    }
  }

  return {
    ok: true,
    updated: body.tiers.length
  }
})
