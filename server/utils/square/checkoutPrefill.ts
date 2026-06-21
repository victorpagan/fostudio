export function toSquareE164Phone(value: string | null | undefined): string | undefined {
  const raw = (value ?? '').trim()
  if (!raw) return undefined

  const digits = raw.replace(/\D/g, '')
  const normalized = raw.startsWith('+')
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith('1')
        ? `+${digits}`
        : null

  if (!normalized || !/^\+\d{8,15}$/.test(normalized)) return undefined
  return normalized
}

export function toSquareBuyerPhone(value: string | null | undefined): string | undefined {
  return toSquareE164Phone(value)
}
