import { DateTime } from 'luxon'

type BillingPeriodInput = {
  cadence: string
  timeZone?: string
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

function toIso(value: unknown, zone: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = DateTime.fromISO(value.trim(), { zone })
  return parsed.isValid ? parsed.toUTC().toISO() : null
}

function shiftCadence(iso: string, cadence: string, zone: string, direction: number) {
  const value = DateTime.fromISO(iso, { zone })
  const duration = cadence === 'daily'
    ? { days: direction }
    : cadence === 'weekly'
      ? { weeks: direction }
      : { months: direction * (cadence === 'annual' ? 12 : cadence === 'quarterly' ? 3 : 1) }
  return value.plus(duration).toUTC().toISO()
}

export function resolveMembershipBillingPeriod(input: BillingPeriodInput): BillingPeriod | null {
  const zone = String(readFirst(input.subscription, [['timezone']]) ?? input.timeZone ?? 'America/Los_Angeles')
  if (!DateTime.now().setZone(zone).isValid) return null

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

  let currentPeriodStart = toIso(rawStart, zone)
  let currentPeriodEnd = toIso(rawEnd, zone)

  if (!currentPeriodStart && currentPeriodEnd) {
    currentPeriodStart = shiftCadence(currentPeriodEnd, input.cadence, zone, -1)
  }

  if (currentPeriodStart && !currentPeriodEnd) {
    currentPeriodEnd = shiftCadence(currentPeriodStart, input.cadence, zone, 1)
  }

  if (!currentPeriodStart || !currentPeriodEnd) return null
  if (new Date(currentPeriodStart).getTime() >= new Date(currentPeriodEnd).getTime()) return null

  return {
    currentPeriodStart,
    currentPeriodEnd
  }
}
