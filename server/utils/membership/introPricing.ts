export function firstMonthPromoBase(cycleCents: number, cadence: string) {
  const months = ({ monthly: 1, quarterly: 3, annual: 12 } as Record<string, number>)[cadence]
  if (!months) throw new Error('Membership promos require monthly, quarterly, or annual billing.')
  if (!Number.isSafeInteger(cycleCents) || cycleCents < 0) throw new Error('Invalid membership price.')
  return Math.floor(cycleCents / months)
}

export function introductoryPhases(cadence: string, firstCents: number, renewalCents: number, currency: string) {
  firstMonthPromoBase(renewalCents, cadence)
  if (!Number.isSafeInteger(firstCents) || firstCents < 0 || firstCents > renewalCents) {
    throw new Error('Invalid introductory price.')
  }
  return [
    { ordinal: 0n, cadence: cadence.toUpperCase(), periods: 1, pricing: { type: 'STATIC', priceMoney: { amount: BigInt(firstCents), currency } } },
    { ordinal: 1n, cadence: cadence.toUpperCase(), pricing: { type: 'STATIC', priceMoney: { amount: BigInt(renewalCents), currency } } }
  ]
}
