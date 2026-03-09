import { randomUUID } from 'node:crypto'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'
import { useSquareClient } from '~~/server/utils/square'

type ConfigRow = { key: string, value: unknown }

function readConfigValue(rows: ConfigRow[] | null | undefined, key: string) {
  return rows?.find(row => row.key === key)?.value
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
            productType: 'REGULAR',
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
      await square.catalog.object.upsert({
        idempotencyKey: randomUUID(),
        object: {
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
        }
      } as never)

      await square.catalog.object.upsert({
        idempotencyKey: randomUUID(),
        object: {
          id: squareItemId,
          type: 'ITEM',
          presentAtAllLocations: true,
          itemData: {
            name: label,
            isTaxable: false,
            taxIds: [],
            productType: 'REGULAR'
          }
        }
      } as never)
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
