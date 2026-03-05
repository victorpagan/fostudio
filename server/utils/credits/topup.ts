export type CreditPricingOptionRow = {
  id: string
  key: string
  label: string
  description: string | null
  credits: number
  base_price_cents: number
  sale_price_cents: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  active: boolean
  sort_order: number
  square_item_id: string | null
  square_variation_id: string | null
}

export type CreditTopupOption = {
  id: string
  key: string
  label: string
  description: string | null
  credits: number
  basePriceCents: number
  effectivePriceCents: number
  salePriceCents: number | null
  saleActive: boolean
  saleStartsAt: string | null
  saleEndsAt: string | null
  sortOrder: number
  squareItemId: string | null
  squareVariationId: string | null
}

function parseIso(value: string | null) {
  if (!value) return null
  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function isCreditOptionSaleActive(row: CreditPricingOptionRow, now = new Date()) {
  if (!row.sale_price_cents) return false

  const startsAt = parseIso(row.sale_starts_at)
  const endsAt = parseIso(row.sale_ends_at)

  if (startsAt && now < startsAt) return false
  if (endsAt && now > endsAt) return false
  return true
}

export function getCreditOptionEffectivePriceCents(row: CreditPricingOptionRow, now = new Date()) {
  return isCreditOptionSaleActive(row, now)
    ? Number(row.sale_price_cents ?? row.base_price_cents)
    : Number(row.base_price_cents)
}

export function mapCreditOption(row: CreditPricingOptionRow, now = new Date()): CreditTopupOption {
  const saleActive = isCreditOptionSaleActive(row, now)
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    credits: Number(row.credits),
    basePriceCents: Number(row.base_price_cents),
    effectivePriceCents: getCreditOptionEffectivePriceCents(row, now),
    salePriceCents: row.sale_price_cents === null ? null : Number(row.sale_price_cents),
    saleActive,
    saleStartsAt: row.sale_starts_at,
    saleEndsAt: row.sale_ends_at,
    sortOrder: Number(row.sort_order),
    squareItemId: row.square_item_id,
    squareVariationId: row.square_variation_id
  }
}
