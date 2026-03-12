import { serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { extractSquareCards } from '~~/server/utils/square/cards'
import { ensureSquareCustomerForUser, getPrimaryCustomerRowForUser } from '~~/server/utils/square/customer'

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

function normalizeExpiryYear(year: number | null) {
  if (!year) return null
  if (year < 100) return 2000 + year
  return year
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
      squareCustomerId: null,
      defaultCardId: null as string | null
    }
  }

  const square = await useSquareClient(event)
  const listRes = await square.cards.list({
    customerId: squareCustomerId,
    includeDisabled: false,
    sortOrder: 'ASC'
  } as never)
  const cards = extractSquareCards(listRes)

  const methods = cards
    .map((card): SquareCardSummary | null => {
      const id = readString(card, 'id')
      if (!id) return null
      const enabledValue = card.enabled
      const enabled = typeof enabledValue === 'boolean' ? enabledValue : true
      const expMonth = readNumber(card, 'expMonth', 'exp_month')
      const expYear = normalizeExpiryYear(readNumber(card, 'expYear', 'exp_year'))
      return {
        id,
        brand: readString(card, 'cardBrand', 'card_brand'),
        last4: readString(card, 'last4'),
        expMonth,
        expYear,
        cardholderName: readString(card, 'cardholderName', 'cardholder_name'),
        enabled
      }
    })
    .filter((card): card is SquareCardSummary => card !== null && card.enabled)

  const primaryCustomer = await getPrimaryCustomerRowForUser(event, user.sub)
  const persistedDefaultCardId = typeof primaryCustomer?.default_square_card_id === 'string'
    ? primaryCustomer.default_square_card_id.trim()
    : ''
  const enabledCardIds = new Set(methods.filter(method => method.enabled).map(method => method.id))
  const defaultCardId = persistedDefaultCardId && enabledCardIds.has(persistedDefaultCardId)
    ? persistedDefaultCardId
    : (methods.find(method => method.enabled)?.id ?? null)

  return {
    methods,
    squareCustomerId,
    defaultCardId
  }
})
