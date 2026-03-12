import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { extractSquareCards } from '~~/server/utils/square/cards'
import { ensureSquareCustomerForUser, getPrimaryCustomerRowForUser } from '~~/server/utils/square/customer'

const bodySchema = z.object({
  cardId: z.string().min(5)
})

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event))
  const supabase = serverSupabaseServiceRole(event)

  const squareCustomerId = await ensureSquareCustomerForUser(event, {
    userId: user.sub,
    email: user.email ?? null
  })
  if (!squareCustomerId) throw createError({ statusCode: 503, statusMessage: 'Could not initialize Square customer.' })

  const primaryCustomer = await getPrimaryCustomerRowForUser(event, user.sub)
  if (!primaryCustomer?.id) throw createError({ statusCode: 404, statusMessage: 'Customer record not found.' })

  const square = await useSquareClient(event)
  const listRes = await square.cards.list({
    customerId: squareCustomerId,
    includeDisabled: true,
    sortOrder: 'ASC'
  } as never)
  const cards = extractSquareCards(listRes)

  const selected = cards.find((card) => readString(card, 'id') === body.cardId.trim()) ?? null
  if (!selected) throw createError({ statusCode: 404, statusMessage: 'Card not found for this account.' })
  const isEnabled = typeof selected.enabled === 'boolean' ? selected.enabled : true
  if (!isEnabled) throw createError({ statusCode: 409, statusMessage: 'Selected card is not available.' })

  const { error } = await supabase
    .from('customers')
    .update({ default_square_card_id: body.cardId.trim() } as never)
    .eq('id', primaryCustomer.id)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { ok: true }
})
