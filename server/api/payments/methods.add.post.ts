import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { ensureSquareCustomerForUser, getPrimaryCustomerRowForUser } from '~~/server/utils/square/customer'

const bodySchema = z.object({
  sourceId: z.string().min(10)
})

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readSquareErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (!error || typeof error !== 'object') return 'Square request failed'
  const details = (error as { errors?: unknown }).errors
  if (!Array.isArray(details) || details.length === 0) return 'Square request failed'
  const first = details[0]
  if (!first || typeof first !== 'object') return 'Square request failed'
  const detail = (first as { detail?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  const code = (first as { code?: unknown }).code
  if (typeof code === 'string' && code.trim()) return code.trim()
  return 'Square request failed'
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  const supabase = serverSupabaseServiceRole(event)

  const body = bodySchema.parse(await readBody(event))
  const squareCustomerId = await ensureSquareCustomerForUser(event, {
    userId: user.sub,
    email: user.email ?? null
  })

  if (!squareCustomerId) throw createError({ statusCode: 503, statusMessage: 'Could not initialize Square customer.' })

  const square = await useSquareClient(event)
  try {
    const userKey = user.sub.replace(/-/g, '').slice(0, 12)
    const nonce = randomUUID().replace(/-/g, '').slice(0, 16)
    const cardRes = await square.cards.create({
      idempotencyKey: `pm:add:${userKey}:${nonce}`,
      sourceId: body.sourceId.trim(),
      card: {
        customerId: squareCustomerId
      }
    } as never)
    const card = (cardRes as { card?: Record<string, unknown> | null }).card ?? null
    const cardId = readString(card, 'id')
    if (!cardId) throw createError({ statusCode: 502, statusMessage: 'Square did not return a card id.' })

    const primaryCustomer = await getPrimaryCustomerRowForUser(event, user.sub)
    const hasDefaultCard = typeof primaryCustomer?.default_square_card_id === 'string'
      && primaryCustomer.default_square_card_id.trim().length > 0

    if (primaryCustomer?.id && !hasDefaultCard) {
      await supabase
        .from('customers')
        .update({ default_square_card_id: cardId } as never)
        .eq('id', primaryCustomer.id)
    }

    return {
      ok: true,
      cardId
    }
  } catch (error) {
    throw createError({ statusCode: 502, statusMessage: `Failed to save card: ${readSquareErrorMessage(error)}` })
  }
})
