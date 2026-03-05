import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

const bodySchema = z.object({
  id: z.string().uuid()
})

function isSquareNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const maybe = error as {
    errors?: Array<{ code?: string, category?: string }>
    body?: { errors?: Array<{ code?: string, category?: string }> }
  }
  const errors = maybe.errors ?? maybe.body?.errors ?? []
  return errors.some(item => item?.code === 'NOT_FOUND' || item?.category === 'INVALID_REQUEST_ERROR')
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))

  const { data: option, error: optionErr } = await db
    .from('credit_pricing_options')
    .select('id,square_item_id,square_variation_id')
    .eq('id', body.id)
    .maybeSingle()

  if (optionErr) throw createError({ statusCode: 500, statusMessage: optionErr.message })
  if (!option) throw createError({ statusCode: 404, statusMessage: 'Credit option not found' })

  if (option.square_item_id) {
    const square = await useSquareClient(event)
    try {
      await square.catalog.object.delete({ objectId: option.square_item_id } as never)
    } catch (error) {
      if (!isSquareNotFoundError(error)) {
        const message = error instanceof Error ? error.message : 'Failed to delete Square item'
        throw createError({ statusCode: 502, statusMessage: message })
      }
    }
  }

  const { error: updateErr } = await db
    .from('credit_pricing_options')
    .update({
      square_item_id: null,
      square_variation_id: null
    })
    .eq('id', option.id)

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  return {
    ok: true,
    id: option.id
  }
})
