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

  const beginTime = params.beginTime
    ? DateTime.fromISO(params.beginTime).minus({ days: 1 }).toUTC().toISO()
    : DateTime.utc().minus({ days: 30 }).toISO()

  const pageable = await square.payments.list({
    beginTime,
    sortOrder: 'DESC',
    sortField: 'CREATED_AT',
    limit: 100
  } as never)

  let scanned = 0
  let paymentStatus: string | null = null
  let paymentId: string | null = null
  let paymentCustomerId: string | null = null

  for await (const item of pageable as AsyncIterable<Record<string, unknown>>) {
    scanned += 1
    if (scanned > maxPaymentsToScan) break

    const paymentOrderId = readString(item, 'orderId', 'order_id')
    if (paymentOrderId !== orderId) continue

    const status = readString(item, 'status')?.toUpperCase() ?? null
    paymentStatus = paymentStatus ?? status
    paymentId = paymentId ?? readString(item, 'id')
    paymentCustomerId = paymentCustomerId ?? readString(item, 'customerId', 'customer_id')

    if (status === 'COMPLETED') {
      return {
        orderState,
        orderCustomerId,
        orderId,
        completed: true,
        paymentId: readString(item, 'id') ?? paymentId,
        paymentStatus: status,
        paymentCustomerId: readString(item, 'customerId', 'customer_id') ?? paymentCustomerId
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
    paymentCustomerId
  } as OrderPaymentState
}
