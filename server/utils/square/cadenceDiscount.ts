import { randomUUID } from 'node:crypto'
import { parseDiscountLabel } from '~~/app/utils/membershipDiscount'

export type MembershipCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

type DiscountShape = { type: 'percent', amount: number, normalizedAmount: string } | { type: 'dollar', amount: number, amountCents: number, normalizedAmount: string, currency: string }

function cadenceLabel(cadence: MembershipCadence) {
  if (cadence === 'daily') return 'Daily'
  if (cadence === 'weekly') return 'Weekly'
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return 'Monthly'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readObjects(response: unknown) {
  if (!response || typeof response !== 'object') return [] as Record<string, unknown>[]
  const payload = response as {
    objects?: unknown[]
    body?: { objects?: unknown[] }
    result?: { objects?: unknown[] }
  }
  const values = payload.objects ?? payload.body?.objects ?? payload.result?.objects ?? []
  if (!Array.isArray(values)) return [] as Record<string, unknown>[]
  return values
    .map(entry => asRecord(entry))
    .filter(Boolean) as Record<string, unknown>[]
}

function readCursor(response: unknown) {
  if (!response || typeof response !== 'object') return null
  const payload = response as {
    cursor?: unknown
    body?: { cursor?: unknown }
    result?: { cursor?: unknown }
  }
  const value = payload.cursor ?? payload.body?.cursor ?? payload.result?.cursor
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readAmountCents(value: unknown) {
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.round(parsed)
  }
  return null
}

function normalizeAmount(value: number) {
  if (!Number.isFinite(value)) return null
  if (Number.isInteger(value)) return String(value)
  return Number(value.toFixed(2)).toString()
}

function normalizeDiscountShape(params: {
  discountLabel: string | null | undefined
  currency: string
}) {
  const parsed = parseDiscountLabel(params.discountLabel)
  if (parsed.type === 'none') return null

  const amount = Number(parsed.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const normalizedAmount = normalizeAmount(amount)
  if (!normalizedAmount) return null

  if (parsed.type === 'percent') {
    if (amount > 100) return null
    return {
      type: 'percent',
      amount,
      normalizedAmount
    } as const
  }

  return {
    type: 'dollar',
    amount,
    amountCents: Math.round(amount * 100),
    normalizedAmount,
    currency: params.currency.toUpperCase()
  } as const
}

function buildDiscountName(params: {
  cadence: MembershipCadence
  tierDisplayName?: string | null
  shape: DiscountShape
}) {
  const tierName = params.tierDisplayName?.trim() || 'FO Studio'
  if (params.shape.type === 'percent') {
    return `${tierName} - ${cadenceLabel(params.cadence)} ${params.shape.normalizedAmount}%`
  }
  return `${tierName} - ${cadenceLabel(params.cadence)} $${params.shape.normalizedAmount}`
}

function resolveCatalogObjectId(
  tempObjectId: string,
  response: unknown
) {
  const payload = asRecord(response)
  const mappingsRaw = payload?.idMappings ?? payload?.id_mappings
  if (Array.isArray(mappingsRaw)) {
    for (const entry of mappingsRaw) {
      const mapping = asRecord(entry)
      const clientObjectId = readString(mapping, 'clientObjectId', 'client_object_id')
      const objectId = readString(mapping, 'objectId', 'object_id')
      if (clientObjectId === tempObjectId && objectId) return objectId
    }
  }

  const catalogObject = asRecord(payload?.catalogObject ?? payload?.catalog_object ?? payload?.object)
  return readString(catalogObject, 'id')
}

function isMatchingDiscountObject(params: {
  object: Record<string, unknown>
  expectedName: string
  shape: DiscountShape
}) {
  const discountData = asRecord(params.object.discountData ?? params.object.discount_data)
  if (!discountData) return { exactName: false, amountMatches: false }

  const discountType = readString(discountData, 'discountType', 'discount_type')?.toUpperCase()
  const name = readString(discountData, 'name')

  if (params.shape.type === 'percent') {
    if (discountType !== 'FIXED_PERCENTAGE') return { exactName: false, amountMatches: false }
    const percentageRaw = readString(discountData, 'percentage')
    const percentage = Number(percentageRaw ?? '')
    if (!Number.isFinite(percentage)) return { exactName: false, amountMatches: false }
    const amountMatches = Math.abs(percentage - params.shape.amount) < 0.0001
    const exactName = Boolean(name && name.toLowerCase() === params.expectedName.toLowerCase())
    return { exactName, amountMatches }
  }

  if (discountType !== 'FIXED_AMOUNT') return { exactName: false, amountMatches: false }
  const amountMoney = asRecord(discountData.amountMoney ?? discountData.amount_money)
  const amountCents = readAmountCents(amountMoney?.amount)
  const currency = readString(amountMoney, 'currency')?.toUpperCase()
  const amountMatches = amountCents === params.shape.amountCents
    && (!currency || currency === params.shape.currency)
  const exactName = Boolean(name && name.toLowerCase() === params.expectedName.toLowerCase())
  return { exactName, amountMatches }
}

async function findExistingDiscountId(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any
  expectedName: string
  shape: DiscountShape
}) {
  let cursor: string | null = null
  let fallbackId: string | null = null

  for (let page = 0; page < 20; page += 1) {
    const response = await params.square.catalog.search({
      objectTypes: ['DISCOUNT'],
      includeDeletedObjects: false,
      includeRelatedObjects: false,
      limit: 100,
      cursor: cursor ?? undefined
    } as never)

    const objects = readObjects(response)
    for (const object of objects) {
      const id = readString(object, 'id')
      const type = readString(object, 'type')?.toUpperCase()
      const isDeleted = object.isDeleted === true || object.is_deleted === true
      if (!id || type !== 'DISCOUNT' || isDeleted) continue

      const match = isMatchingDiscountObject({
        object,
        expectedName: params.expectedName,
        shape: params.shape
      })
      if (!match.amountMatches) continue
      if (match.exactName) return id
      if (!fallbackId) fallbackId = id
    }

    cursor = readCursor(response)
    if (!cursor) break
  }

  return fallbackId
}

export async function resolveOrCreateSquareCadenceDiscountId(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any
  cadence: MembershipCadence
  discountLabel: string | null | undefined
  currency: string
  tierDisplayName?: string | null
}) {
  const shape = normalizeDiscountShape({
    discountLabel: params.discountLabel,
    currency: params.currency
  })
  if (!shape) return null

  const expectedName = buildDiscountName({
    cadence: params.cadence,
    tierDisplayName: params.tierDisplayName,
    shape
  })

  const existingDiscountId = await findExistingDiscountId({
    square: params.square,
    expectedName,
    shape
  })
  if (existingDiscountId) return existingDiscountId

  const tempObjectId = `#checkout_${params.cadence}_discount_${randomUUID().slice(0, 8)}`
  const discountObject = shape.type === 'percent'
    ? {
        id: tempObjectId,
        type: 'DISCOUNT' as const,
        discountData: {
          name: expectedName,
          discountType: 'FIXED_PERCENTAGE' as const,
          percentage: shape.normalizedAmount
        }
      }
    : {
        id: tempObjectId,
        type: 'DISCOUNT' as const,
        discountData: {
          name: expectedName,
          discountType: 'FIXED_AMOUNT' as const,
          amountMoney: {
            amount: BigInt(shape.amountCents),
            currency: shape.currency
          }
        }
      }

  const createRes = await params.square.catalog.object.upsert({
    idempotencyKey: randomUUID(),
    object: discountObject
  } as never)

  const createdId = resolveCatalogObjectId(tempObjectId, createRes)
  if (!createdId) throw new Error('Square discount ID could not be resolved')
  return createdId
}
