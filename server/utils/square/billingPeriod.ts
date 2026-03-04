type BillingPeriodInput = {
  cadence: string
  invoice?: unknown
  subscription?: unknown
  fallbackStart?: string | null
  fallbackEnd?: string | null
}

type BillingPeriod = {
  currentPeriodStart: string
  currentPeriodEnd: string
}

function readPath(source: unknown, path: string[]) {
  let current: unknown = source

  for (const key of path) {
    if (!current || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[key]
  }

  if (current === undefined || current === null || current === '') return null
  return current
}

function readFirst(source: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = readPath(source, path)
    if (value !== null) return value
  }

  return null
}

function toIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null

  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function addMonths(iso: string, months: number) {
  const value = new Date(iso)
  value.setUTCMonth(value.getUTCMonth() + months)
  return value.toISOString()
}

function subtractMonths(iso: string, months: number) {
  return addMonths(iso, -months)
}

function monthsForCadence(cadence: string) {
  if (cadence === 'annual') return 12
  if (cadence === 'quarterly') return 3
  return 1
}

export function resolveMembershipBillingPeriod(input: BillingPeriodInput): BillingPeriod | null {
  const cadenceMonths = monthsForCadence(input.cadence)

  const rawStart = readFirst(input.invoice, [
    ['subscriptionDetails', 'billingPeriodStartDate'],
    ['subscription_details', 'billing_period_start_date'],
    ['subscriptionDetails', 'billingPeriodStartAt'],
    ['subscription_details', 'billing_period_start_at']
  ]) ?? readFirst(input.subscription, [
    ['currentPeriodStartDate'],
    ['current_period_start_date'],
    ['startDate'],
    ['start_date']
  ]) ?? input.fallbackStart

  const rawEnd = readFirst(input.invoice, [
    ['subscriptionDetails', 'billingPeriodEndDate'],
    ['subscription_details', 'billing_period_end_date'],
    ['subscriptionDetails', 'billingPeriodEndAt'],
    ['subscription_details', 'billing_period_end_at']
  ]) ?? readFirst(input.subscription, [
    ['chargedThroughDate'],
    ['charged_through_date'],
    ['currentPeriodEndDate'],
    ['current_period_end_date']
  ]) ?? input.fallbackEnd

  let currentPeriodStart = toIso(rawStart)
  let currentPeriodEnd = toIso(rawEnd)

  if (!currentPeriodStart && currentPeriodEnd) {
    currentPeriodStart = subtractMonths(currentPeriodEnd, cadenceMonths)
  }

  if (currentPeriodStart && !currentPeriodEnd) {
    currentPeriodEnd = addMonths(currentPeriodStart, cadenceMonths)
  }

  if (!currentPeriodStart || !currentPeriodEnd) return null
  if (new Date(currentPeriodStart).getTime() >= new Date(currentPeriodEnd).getTime()) return null

  return {
    currentPeriodStart,
    currentPeriodEnd
  }
}
