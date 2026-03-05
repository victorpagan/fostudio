export type CreditTopupBundle = {
  id: 'single' | 'bundle_3' | 'bundle_5' | 'bundle_10'
  label: string
  credits: number
  amountCents: number
}

export const CREDIT_TOPUP_BUNDLES: ReadonlyArray<CreditTopupBundle> = [
  { id: 'single', label: '1 credit', credits: 1, amountCents: 4000 },
  { id: 'bundle_3', label: '3 credits', credits: 3, amountCents: 12000 },
  { id: 'bundle_5', label: '5 credits', credits: 5, amountCents: 19000 },
  { id: 'bundle_10', label: '10 credits', credits: 10, amountCents: 36000 }
]

export function findTopupBundle(bundleId: string | null | undefined) {
  if (!bundleId) return null
  return CREDIT_TOPUP_BUNDLES.find(bundle => bundle.id === bundleId) ?? null
}
