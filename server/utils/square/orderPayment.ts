import { DateTime } from 'luxon'
import type { SquareClient } from 'square'

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export type OrderPaymentState = {
  orderState: string | null
  orderCustomerId: string | null
  orderId: string
  completed: boolean
  paymentId: string | null
  paymentStatus: string | null
  paymentCustomerId: string | null
  paymentCardId: string | null
  paymentCreatedAt: string | null
}

function readCardId(source: Record<string, unknown> | null | undefined) {
  if (!source) return null
  const cardDetails = (source.cardDetails ?? source.card_details) as Record<string, unknown> | null | undefined
  if (!cardDetails) return null
  const card = (cardDetails.card ?? cardDetails.card_data) as Record<string, unknown> | null | undefined
  if (!card) return null
  const value = card.id
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function resolveOrderPaymentState(params: {
  square: SquareClient
  orderId: string
  beginTime?: string | null
  maxPaymentsToScan?: number
}) {
  const { square, orderId } = params
  const maxPaymentsToScan = Number.isFinite(params.maxPaymentsToScan ?? NaN)
    ? Math.max(20, Number(params.maxPaymentsToScan))
    : 200

  const orderRes = await square.orders.get({ orderId } as never)
  const order = (orderRes as { order?: Record<string, unknown> | null }).order ?? null
  const orderState = readString(order, 'state')?.toUpperCase() ?? null
  const orderCustomerId = readString(order, 'customerId', 'customer_id')
  const orderLocationId = readString(order, 'locationId', 'location_id')

  const beginTime = params.beginTime
    ? DateTime.fromISO(params.beginTime).minus({ days: 1 }).toUTC().toISO()
    : DateTime.utc().minus({ days: 30 }).toISO()

  const scanPayments = async (locationId?: string | null) => {
    const pageable = await square.payments.list({
      beginTime,
      sortOrder: 'DESC',
      sortField: 'CREATED_AT',
      limit: 100,
      locationId: locationId ?? undefined
    } as never)

    let scanned = 0
    let paymentStatus: string | null = null
    let paymentId: string | null = null
    let paymentCustomerId: string | null = null
    let paymentCardId: string | null = null
    let paymentCreatedAt: string | null = null

    for await (const item of pageable as AsyncIterable<Record<string, unknown>>) {
      scanned += 1
      if (scanned > maxPaymentsToScan) break

      const paymentOrderId = readString(item, 'orderId', 'order_id')
      if (paymentOrderId !== orderId) continue

      const status = readString(item, 'status')?.toUpperCase() ?? null
      paymentStatus = paymentStatus ?? status
      paymentId = paymentId ?? readString(item, 'id')
      paymentCustomerId = paymentCustomerId ?? readString(item, 'customerId', 'customer_id')
      paymentCardId = paymentCardId ?? readCardId(item)
      paymentCreatedAt = paymentCreatedAt ?? readString(item, 'createdAt', 'created_at')

      if (status === 'COMPLETED') {
        return {
          orderState,
          orderCustomerId,
          orderId,
          completed: true,
          paymentId: readString(item, 'id') ?? paymentId,
          paymentStatus: status,
          paymentCustomerId: readString(item, 'customerId', 'customer_id') ?? paymentCustomerId,
          paymentCardId: readCardId(item) ?? paymentCardId,
          paymentCreatedAt: readString(item, 'createdAt', 'created_at') ?? paymentCreatedAt
        } as OrderPaymentState
      }
    }

    return {
      orderState,
      orderCustomerId,
      orderId,
      completed: orderState === 'COMPLETED',
      paymentId,
      paymentStatus,
      paymentCustomerId,
      paymentCardId,
      paymentCreatedAt
    } as OrderPaymentState
  }

  const locationScoped = await scanPayments(orderLocationId)
  if (locationScoped.completed || locationScoped.paymentId || !orderLocationId) {
    return locationScoped
  }

  // Fallback scan with no location filter. Some setups settle payments on a location
  // different from the order's location or can lag in location-scoped visibility.
  return scanPayments(null)
}
