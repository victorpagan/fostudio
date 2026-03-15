import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

const bodySchema = z.object({
  id: z.string().uuid()
})

function toSquareVersion(value: unknown) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  return undefined
}

function readSquareErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  const bodyIndex = error.message.indexOf('Body:')
  if (bodyIndex < 0) return null
  const jsonPart = error.message.slice(bodyIndex + 5).trim()
  try {
    const parsed = JSON.parse(jsonPart) as { errors?: Array<{ code?: string }> }
    const code = parsed.errors?.[0]?.code
    return typeof code === 'string' ? code : null
  } catch {
    return null
  }
}

async function upsertWithLatestVersion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any,
  object: Record<string, unknown>
) {
  try {
    await square.catalog.object.upsert({
      idempotencyKey: randomUUID(),
      object
    } as never)
    return
  } catch (error) {
    if (readSquareErrorCode(error) !== 'VERSION_MISMATCH') throw error
    const objectId = typeof object.id === 'string' ? object.id.trim() : ''
    if (!objectId) throw error
    const latest = await square.catalog.object.get({
      objectId,
      includeRelatedObjects: false
    } as never)
    const latestVersion = toSquareVersion((latest as { object?: { version?: unknown } }).object?.version)
    if (latestVersion === undefined) throw error
    await square.catalog.object.upsert({
      idempotencyKey: randomUUID(),
      object: {
        ...object,
        version: latestVersion
      }
    } as never)
  }
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid request: ${firstIssue?.message ?? 'invalid payload'}`
    })
  }
  const body = parsed.data

  const { data: option, error: optionErr } = await db
    .from('credit_pricing_options')
    .select(`
      id,
      key,
      label,
      description,
      base_price_cents,
      square_item_id,
      square_variation_id
    `)
    .eq('id', body.id)
    .maybeSingle()

  if (optionErr) throw createError({ statusCode: 500, statusMessage: optionErr.message })
  if (!option) throw createError({ statusCode: 404, statusMessage: 'Credit option not found' })

  const square = await useSquareClient(event)

  let squareItemId = option.square_item_id
  let squareVariationId = option.square_variation_id

  try {
    if (!squareItemId || !squareVariationId) {
      const itemTempId = `#credit_item_${option.key}_${randomUUID().slice(0, 8)}`
      const variationTempId = `#credit_variation_${option.key}_${randomUUID().slice(0, 8)}`

      const upsertRes = await square.catalog.object.upsert({
        idempotencyKey: randomUUID(),
        object: {
          id: itemTempId,
          type: 'ITEM',
          presentAtAllLocations: true,
          itemData: {
            name: option.label,
            descriptionHtml: option.description ?? undefined,
            isTaxable: false,
            taxIds: [],
            productType: 'DIGITAL',
            variations: [
              {
                id: variationTempId,
                type: 'ITEM_VARIATION',
                presentAtAllLocations: true,
                itemVariationData: {
                  itemId: itemTempId,
                  name: 'Default',
                  pricingType: 'FIXED_PRICING',
                  priceMoney: {
                    amount: BigInt(Number(option.base_price_cents)),
                    currency: 'USD'
                  }
                }
              }
            ]
          }
        }
      } as never) as { idMappings?: Array<{ clientObjectId?: string | null, objectId?: string | null }> }

      const mapping = new Map<string, string>()
      for (const item of upsertRes.idMappings ?? []) {
        if (item.clientObjectId && item.objectId) {
          mapping.set(item.clientObjectId, item.objectId)
        }
      }

      squareItemId = mapping.get(itemTempId) ?? null
      squareVariationId = mapping.get(variationTempId) ?? null

      if (!squareItemId || !squareVariationId) {
        throw new Error('Could not resolve Square item IDs from upsert response.')
      }
    } else {
      await upsertWithLatestVersion(square, {
        id: squareVariationId,
        type: 'ITEM_VARIATION',
        presentAtAllLocations: true,
        itemVariationData: {
          itemId: squareItemId,
          name: 'Default',
          pricingType: 'FIXED_PRICING',
          priceMoney: {
            amount: BigInt(Number(option.base_price_cents)),
            currency: 'USD'
          }
        }
      })

      await upsertWithLatestVersion(square, {
        id: squareItemId,
        type: 'ITEM',
        presentAtAllLocations: true,
        itemData: {
          name: option.label,
          descriptionHtml: option.description ?? undefined,
          isTaxable: false,
          taxIds: [],
          productType: 'DIGITAL'
        }
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Square catalog sync failed'
    throw createError({ statusCode: 502, statusMessage: message })
  }

  const { error: updateErr } = await db
    .from('credit_pricing_options')
    .update({
      square_item_id: squareItemId,
      square_variation_id: squareVariationId
    })
    .eq('id', option.id)

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  return {
    ok: true,
    id: option.id,
    squareItemId,
    squareVariationId
  }
})
