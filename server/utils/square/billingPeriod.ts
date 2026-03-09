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

function addCadenceInterval(iso: string, cadence: string) {
  if (cadence === 'daily') {
    const value = new Date(iso)
    value.setUTCDate(value.getUTCDate() + 1)
    return value.toISOString()
  }
  if (cadence === 'weekly') {
    const value = new Date(iso)
    value.setUTCDate(value.getUTCDate() + 7)
    return value.toISOString()
  }
  if (cadence === 'annual') return addMonths(iso, 12)
  if (cadence === 'quarterly') return addMonths(iso, 3)
  return addMonths(iso, 1)
}

function subtractCadenceInterval(iso: string, cadence: string) {
  if (cadence === 'daily') {
    const value = new Date(iso)
    value.setUTCDate(value.getUTCDate() - 1)
    return value.toISOString()
  }
  if (cadence === 'weekly') {
    const value = new Date(iso)
    value.setUTCDate(value.getUTCDate() - 7)
    return value.toISOString()
  }
  if (cadence === 'annual') return subtractMonths(iso, 12)
  if (cadence === 'quarterly') return subtractMonths(iso, 3)
  return subtractMonths(iso, 1)
}

export function resolveMembershipBillingPeriod(input: BillingPeriodInput): BillingPeriod | null {
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
    currentPeriodStart = subtractCadenceInterval(currentPeriodEnd, input.cadence)
  }

  if (currentPeriodStart && !currentPeriodEnd) {
    currentPeriodEnd = addCadenceInterval(currentPeriodStart, input.cadence)
  }

  if (!currentPeriodStart || !currentPeriodEnd) return null
  if (new Date(currentPeriodStart).getTime() >= new Date(currentPeriodEnd).getTime()) return null

  return {
    currentPeriodStart,
    currentPeriodEnd
  }
}
