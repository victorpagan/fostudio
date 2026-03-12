import { serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { ensureSquareCustomerForUser } from '~~/server/utils/square/customer'

type SquareCardSummary = {
  id: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  cardholderName: string | null
  enabled: boolean
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readNumber(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return Math.floor(parsed)
    }
  }
  return null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const squareCustomerId = await ensureSquareCustomerForUser(event, {
    userId: user.sub,
    email: user.email ?? null
  })

  if (!squareCustomerId) {
    return {
      methods: [] as SquareCardSummary[],
      squareCustomerId: null
    }
  }

  const square = await useSquareClient(event)
  const listRes = await square.cards.list({
    customerId: squareCustomerId,
    includeDisabled: false,
    sortOrder: 'ASC'
  } as never)
  const cards = Array.isArray((listRes as { cards?: unknown }).cards)
    ? ((listRes as { cards?: Array<Record<string, unknown>> }).cards ?? [])
    : []

  const methods = cards
    .map((card): SquareCardSummary | null => {
      const id = readString(card, 'id')
      if (!id) return null
      const enabledValue = card.enabled
      const enabled = typeof enabledValue === 'boolean' ? enabledValue : true
      return {
        id,
        brand: readString(card, 'cardBrand', 'card_brand'),
        last4: readString(card, 'last4'),
        expMonth: readNumber(card, 'expMonth', 'exp_month'),
        expYear: readNumber(card, 'expYear', 'exp_year'),
        cardholderName: readString(card, 'cardholderName', 'cardholder_name'),
        enabled
      }
    })
    .filter((card): card is SquareCardSummary => card !== null && card.enabled)

  return {
    methods,
    squareCustomerId
  }
})
