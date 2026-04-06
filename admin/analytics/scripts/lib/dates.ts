import { DateTime } from 'luxon'

const DEFAULT_ZONE = 'America/Los_Angeles'

export function nowInZone(zone = DEFAULT_ZONE) {
  return DateTime.now().setZone(zone)
}

export function normalizeDateInput(input: string | null | undefined, zone = DEFAULT_ZONE) {
  if (!input) return null
  const parsed = DateTime.fromISO(input, { zone })
  if (parsed.isValid) return parsed
  const fallback = DateTime.fromRFC2822(input, { zone })
  return fallback.isValid ? fallback : null
}

export function coerceIsoDate(input: string | null | undefined, zone = DEFAULT_ZONE) {
  const parsed = normalizeDateInput(input, zone)
  return parsed?.toISODate() ?? null
}

export function isoWeekKey(date: DateTime) {
  const weekNumber = String(date.weekNumber).padStart(2, '0')
  return `${date.weekYear}-W${weekNumber}`
}

export function monthKey(date: DateTime) {
  return date.toFormat('yyyy-MM')
}

export function weekStartFromDate(date: DateTime) {
  return date.startOf('week')
}

export function weekEndFromDate(date: DateTime) {
  return date.endOf('week')
}

export function formatWeekOf(date: DateTime) {
  return weekStartFromDate(date).toISODate() ?? date.toISODate() ?? ''
}

export function weekRangeFromWeekOf(weekOf: string | undefined, zone = DEFAULT_ZONE) {
  const anchor = weekOf
    ? normalizeDateInput(weekOf, zone) ?? nowInZone(zone)
    : nowInZone(zone)

  const start = anchor.startOf('week')
  const end = anchor.endOf('week')
  return {
    zone,
    week_of: start.toISODate() ?? '',
    start,
    end,
    previous_start: start.minus({ weeks: 1 }),
    previous_end: end.minus({ weeks: 1 })
  }
}

export function toDateDims(input: string, zone = DEFAULT_ZONE) {
  const parsed = normalizeDateInput(input, zone)
  if (!parsed) {
    const today = nowInZone(zone)
    return {
      date: today.toISODate() ?? '',
      week: isoWeekKey(today),
      month: monthKey(today)
    }
  }

  return {
    date: parsed.toISODate() ?? '',
    week: isoWeekKey(parsed),
    month: monthKey(parsed)
  }
}
