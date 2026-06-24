import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'
import { extractSquareCards } from '~~/server/utils/square/cards'
import { getPrimaryCustomerRowForUser } from '~~/server/utils/square/customer'

const querySchema = z.object({
  userId: z.string().uuid()
})

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
  await requireServerAdmin(event)
  const query = querySchema.parse(getQuery(event))
  const customer = await getPrimaryCustomerRowForUser(event, query.userId)

  if (!customer?.square_customer_id) {
    return {
      methods: [] as SquareCardSummary[],
      squareCustomerId: null,
      defaultCardId: null as string | null
    }
  }

  const square = await useSquareClient(event)
  const listRes = await square.cards.list({
    customerId: customer.square_customer_id,
    includeDisabled: false,
    sortOrder: 'ASC'
  } as never)

  const methods = extractSquareCards(listRes)
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
        expYear: normalizeExpiryYear(readNumber(card, 'expYear', 'exp_year')),
        cardholderName: readString(card, 'cardholderName', 'cardholder_name'),
        enabled
      }
    })
    .filter((card): card is SquareCardSummary => card !== null && card.enabled)

  const persistedDefaultCardId = typeof customer.default_square_card_id === 'string'
    ? customer.default_square_card_id.trim()
    : ''
  const enabledCardIds = new Set(methods.map(method => method.id))
  const defaultCardId = persistedDefaultCardId && enabledCardIds.has(persistedDefaultCardId)
    ? persistedDefaultCardId
    : (methods[0]?.id ?? null)

  return {
    methods,
    squareCustomerId: customer.square_customer_id,
    defaultCardId
  }
})
