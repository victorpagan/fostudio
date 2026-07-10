const USD_INPUT_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/

export function parseUsdInputToCents(
  value: string | number | null | undefined,
  maximumCents = Number.MAX_SAFE_INTEGER
) {
  const normalized = String(value ?? '').trim()
  if (!USD_INPUT_PATTERN.test(normalized)) return null

  const [whole = '0', fraction = ''] = normalized.split('.')
  const cents = (BigInt(whole) * 100n) + BigInt(fraction.padEnd(2, '0') || '0')
  const maximum = BigInt(Math.max(0, Math.trunc(maximumCents)))

  if (cents > maximum || cents > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return Number(cents)
}

export function formatCentsForUsdInput(value: number | null | undefined) {
  const cents = Number(value ?? 0)
  if (!Number.isSafeInteger(cents) || cents < 0) return '0.00'

  const whole = Math.floor(cents / 100)
  const fraction = String(cents % 100).padStart(2, '0')
  return `${whole}.${fraction}`
}
