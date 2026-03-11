import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

type PromoRow = {
  id: string
  square_discount_id: string | null
}

function readSquareObject(response: unknown) {
  if (!response || typeof response !== 'object') return null
  const maybe = response as { object?: unknown, catalogObject?: unknown }
  const object = maybe.object ?? maybe.catalogObject
  if (!object || typeof object !== 'object') return null
  return object as Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const square = await useSquareClient(event).catch(() => null)

  const { data, error } = await db
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const promos = (data ?? []) as Array<PromoRow & Record<string, unknown>>
  const statuses: Record<string, { valid: boolean, reason: string }> = {}

  for (const promo of promos) {
    const discountId = promo.square_discount_id?.trim() || null
    if (!discountId) {
      statuses[promo.id] = { valid: false, reason: 'missing_square_discount' }
      continue
    }
    if (!square) {
      statuses[promo.id] = { valid: false, reason: 'square_unavailable' }
      continue
    }
    try {
      const getRes = await square.catalog.object.get({
        objectId: discountId,
        includeRelatedObjects: false
      } as never)
      const object = readSquareObject(getRes)
      const type = typeof object?.type === 'string' ? object.type : null
      const isDeleted = object?.isDeleted === true || object?.is_deleted === true
      if (type !== 'DISCOUNT') {
        statuses[promo.id] = { valid: false, reason: 'not_discount' }
      } else if (isDeleted) {
        statuses[promo.id] = { valid: false, reason: 'deleted' }
      } else {
        statuses[promo.id] = { valid: true, reason: 'ok' }
      }
    } catch {
      statuses[promo.id] = { valid: false, reason: 'not_found' }
    }
  }

  return {
    promos: promos.map((promo) => ({
      ...promo,
      square_sync: statuses[promo.id] ?? { valid: false, reason: 'unknown' }
    }))
  }
})
