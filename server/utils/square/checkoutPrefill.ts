export function toSquareBuyerPhone(value: string | null | undefined): string | undefined {
  const raw = (value ?? '').trim()
  if (!raw) return undefined

  // Keep leading + and digits only.
  const cleaned = raw.replace(/[^\d+]/g, '')
  const normalized = cleaned.startsWith('+')
    ? `+${cleaned.slice(1).replace(/\D/g, '')}`
    : `+1${cleaned.replace(/\D/g, '')}`

  // Square expects E.164-like value: + followed by 8-15 digits.
  if (!/^\+\d{8,15}$/.test(normalized)) return undefined
  return normalized
}
