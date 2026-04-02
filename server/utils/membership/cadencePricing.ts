import { parseDiscountLabel } from '~~/app/utils/membershipDiscount'

type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

/**
 * Number of monthly billing periods contained in one cadence cycle.
 * Returns null for daily/weekly since they don't map to month multiples.
 */
export function cadenceToMonths(cadence: Cadence): number | null {
  switch (cadence) {
    case 'monthly': return 1
    case 'quarterly': return 3
    case 'annual': return 12
    default: return null
  }
}

/**
 * Compute the total amount (in cents) Square should charge per billing cycle.
 *
 * Logic mirrors the checkout UI's `billedCycleCents()`:
 *   totalCycleCents = monthlyPriceCents × cadenceMonths
 *   then apply discount_label (percent or dollar off)
 *
 * For daily/weekly cadences (no month multiplier), returns the variation's
 * own price_cents unchanged.
 */
export function computeCyclePriceCents(opts: {
  monthlyPriceCents: number
  cadence: Cadence
  discountLabel: string | null | undefined
}): number {
  const months = cadenceToMonths(opts.cadence)
  if (!months) return opts.monthlyPriceCents

  let cycleCents = opts.monthlyPriceCents * months
  const discount = parseDiscountLabel(opts.discountLabel)

  if (discount.type === 'percent') {
    const pct = Number(discount.amount)
    if (Number.isFinite(pct) && pct > 0) {
      const clamped = Math.min(100, Math.max(0, pct))
      cycleCents = Math.round(cycleCents * (1 - clamped / 100))
    }
  }

  if (discount.type === 'dollar') {
    const dollarAmount = Number(discount.amount)
    if (Number.isFinite(dollarAmount) && dollarAmount > 0) {
      cycleCents = Math.max(0, cycleCents - Math.round(dollarAmount * 100))
    }
  }

  return cycleCents
}
