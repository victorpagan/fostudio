import { randomUUID } from 'node:crypto'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'
import { useSquareClient } from '~~/server/utils/square'

type ConfigRow = { key: string, value: unknown }

function readConfigValue(rows: ConfigRow[] | null | undefined, key: string) {
  return rows?.find(row => row.key === key)?.value
}

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

  const { data: rows, error: configErr } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', [
      'hold_topup_label',
      'hold_topup_price_cents',
      'hold_topup_square_item_id',
      'hold_topup_square_variation_id'
    ])

  if (configErr) throw createError({ statusCode: 500, statusMessage: configErr.message })

  const label = String(readConfigValue(rows, 'hold_topup_label') ?? 'Overnight hold add-on').trim()
  const amountCents = Math.floor(Number(readConfigValue(rows, 'hold_topup_price_cents') ?? 2500))
  let squareItemId = String(readConfigValue(rows, 'hold_topup_square_item_id') ?? '').trim() || null
  let squareVariationId = String(readConfigValue(rows, 'hold_topup_square_variation_id') ?? '').trim() || null

  if (!label) {
    throw createError({ statusCode: 400, statusMessage: 'Hold top-up label is required before syncing.' })
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Hold top-up price must be greater than zero.' })
  }

  const square = await useSquareClient(event)

  try {
    if (!squareItemId || !squareVariationId) {
      const itemTempId = `#hold_item_${randomUUID().slice(0, 8)}`
      const variationTempId = `#hold_variation_${randomUUID().slice(0, 8)}`
      const upsertRes = await square.catalog.object.upsert({
        idempotencyKey: randomUUID(),
        object: {
          id: itemTempId,
          type: 'ITEM',
          presentAtAllLocations: true,
          itemData: {
            name: label,
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
                    amount: BigInt(amountCents),
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
        if (item.clientObjectId && item.objectId) mapping.set(item.clientObjectId, item.objectId)
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
            amount: BigInt(amountCents),
            currency: 'USD'
          }
        }
      })

      const latestItemRes = await square.catalog.object.get({
        objectId: squareItemId,
        includeRelatedObjects: false
      } as never)
      const latestItem = (latestItemRes as { object?: Record<string, unknown> }).object
      if (!latestItem) throw new Error('Could not load latest Square hold item before update.')

      const itemData = (latestItem.itemData ?? {}) as Record<string, unknown>
      const existingVariations = Array.isArray(itemData.variations) ? itemData.variations : []
      if (existingVariations.length === 0) {
        throw new Error('Square hold item is missing variations; re-create this item in Square and retry.')
      }

      await upsertWithLatestVersion(square, {
        ...latestItem,
        id: squareItemId,
        type: 'ITEM',
        presentAtAllLocations: true,
        itemData: {
          ...itemData,
          name: label,
          isTaxable: false,
          taxIds: [],
          productType: 'DIGITAL',
          variations: existingVariations
        }
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Square catalog sync failed'
    throw createError({ statusCode: 502, statusMessage: message })
  }

  const { error: updateErr } = await supabase
    .from('system_config')
    .upsert([
      { key: 'hold_topup_square_item_id', value: squareItemId },
      { key: 'hold_topup_square_variation_id', value: squareVariationId }
    ], { onConflict: 'key' })

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })
  await refreshServerConfig()

  return {
    ok: true,
    squareItemId,
    squareVariationId
  }
})
