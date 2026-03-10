import { z } from 'zod'
import { serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { ensureSquareCustomerForUser } from '~~/server/utils/square/customer'

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

  const body = bodySchema.parse(await readBody(event))
  const squareCustomerId = await ensureSquareCustomerForUser(event, {
    userId: user.sub,
    email: user.email ?? null
  })

  if (!squareCustomerId) throw createError({ statusCode: 503, statusMessage: 'Could not initialize Square customer.' })

  const square = await useSquareClient(event)
  const listRes = await square.cards.list({ customerId: squareCustomerId, includeDisabled: false } as never)
  const cards = Array.isArray((listRes as { cards?: unknown }).cards)
    ? ((listRes as { cards?: Array<Record<string, unknown>> }).cards ?? [])
    : []
  const ownsCard = cards.some(card => readString(card, 'id') === body.cardId.trim())
  if (!ownsCard) throw createError({ statusCode: 404, statusMessage: 'Card not found for this account.' })

  try {
    await square.cards.disable({ cardId: body.cardId.trim() } as never)
    return { ok: true }
  } catch (error) {
    throw createError({ statusCode: 502, statusMessage: `Failed to remove card: ${readSquareErrorMessage(error)}` })
  }
})
