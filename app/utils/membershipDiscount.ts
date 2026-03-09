export type DiscountType = 'none' | 'percent' | 'dollar'

export type DiscountLabelState = {
  type: DiscountType
  amount: string
  rawLabel: string
}

function formatAmount(value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  if (Number.isInteger(parsed)) return String(parsed)
  return Number(parsed.toFixed(2)).toString()
}

export function parseDiscountLabel(label: string | null | undefined): DiscountLabelState {
  const raw = (label ?? '').trim()
  if (!raw) return { type: 'none', amount: '', rawLabel: '' }

  const percentMatch = raw.match(/(-?\d+(?:\.\d+)?)\s*%/)
  if (percentMatch?.[1]) {
    return {
      type: 'percent',
      amount: percentMatch[1],
      rawLabel: raw
    }
  }

  const dollarMatch = raw.match(/\$\s*(-?\d+(?:\.\d+)?)/)
  if (dollarMatch?.[1]) {
    return {
      type: 'dollar',
      amount: dollarMatch[1],
      rawLabel: raw
    }
  }

  return {
    type: 'none',
    amount: '',
    rawLabel: raw
  }
}

export function buildDiscountLabel(type: DiscountType, amount: string, fallbackLabel = ''): string | null {
  if (type === 'none') return fallbackLabel.trim() || null

  const normalizedAmount = formatAmount(amount)
  if (!normalizedAmount) return null

  if (type === 'percent') {
    return `Save ${normalizedAmount}%`
  }

  return `Save $${normalizedAmount}`
}

export function normalizeDiscountLabel(label: string | null | undefined): string | null {
  const state = parseDiscountLabel(label)
  return buildDiscountLabel(state.type, state.amount, state.rawLabel)
}
