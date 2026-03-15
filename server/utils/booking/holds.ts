import { DateTime } from 'luxon'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'

export const DEFAULT_MIN_HOLD_BOOKING_HOURS = 4
export const DEFAULT_HOLD_MIN_END_HOUR = 18
export const DEFAULT_HOLD_END_HOUR = 8

type HoldCycleWindowInput = {
  periodStartIso?: string | null
  periodEndIso?: string | null
  now?: DateTime
}

function parseLocalDateTime(value?: string | null) {
  if (!value) return null
  const dt = DateTime.fromISO(value, { zone: STUDIO_TZ })
  return dt.isValid ? dt : null
}

export function resolveHoldCycleWindow(input: HoldCycleWindowInput = {}) {
  const nowLocal = (input.now ?? DateTime.now()).setZone(STUDIO_TZ)
  const periodStart = parseLocalDateTime(input.periodStartIso)

  // Hold allowance is monthly, anchored to membership cycle start when present.
  // We intentionally do not clamp by membership period end so daily/weekly billing
  // cadences still use a monthly hold cap window.
  if (periodStart && periodStart <= nowLocal) {
    let windowStart = periodStart
    while (windowStart.plus({ months: 1 }) <= nowLocal) {
      windowStart = windowStart.plus({ months: 1 })
    }

    const windowEnd = windowStart.plus({ months: 1 })
    return {
      startLocal: windowStart,
      endLocal: windowEnd,
      startIso: windowStart.toUTC().toISO(),
      endIso: windowEnd.toUTC().toISO()
    }
  }

  const fallbackStart = nowLocal.startOf('month')
  const fallbackEnd = fallbackStart.plus({ months: 1 })

  return {
    startLocal: fallbackStart,
    endLocal: fallbackEnd,
    startIso: fallbackStart.toUTC().toISO(),
    endIso: fallbackEnd.toUTC().toISO()
  }
}

export function validateOvernightHoldWindow(
  start: DateTime,
  end: DateTime,
  minBookingHours: number = DEFAULT_MIN_HOLD_BOOKING_HOURS,
  minEndHour: number = DEFAULT_HOLD_MIN_END_HOUR
) {
  const localStart = start.setZone(STUDIO_TZ)
  const localEnd = end.setZone(STUDIO_TZ)
  const safeMinHours = Math.max(1, Number(minBookingHours || DEFAULT_MIN_HOLD_BOOKING_HOURS))
  const safeMinEndHour = Math.max(0, Math.min(23, Math.floor(minEndHour)))

  const durationHours = localEnd.diff(localStart, 'hours').hours
  if (durationHours < safeMinHours) {
    return {
      ok: false as const,
      code: 'duration' as const,
      message: `Overnight holds require a minimum booking length of ${safeMinHours} hours.`
    }
  }

  const requiredEnd = localEnd.startOf('day').set({ hour: safeMinEndHour, minute: 0, second: 0, millisecond: 0 })
  if (localEnd < requiredEnd) {
    const label = DateTime.fromObject({ hour: safeMinEndHour, minute: 0 }).toFormat('h:mm a')
    return {
      ok: false as const,
      code: 'end_time' as const,
      message: `Overnight holds require booking end time at or after ${label}.`
    }
  }

  return { ok: true as const, code: 'ok' as const, message: null }
}

export function computeOvernightHoldWindow(end: DateTime, holdEndHour: number = DEFAULT_HOLD_END_HOUR) {
  const localEnd = end.setZone(STUDIO_TZ)
  const nextDay = localEnd.startOf('day').plus({ days: 1 })
  const safeHoldEndHour = Math.max(0, Math.min(23, Math.floor(holdEndHour)))
  const holdEndLocal = nextDay.set({ hour: safeHoldEndHour, minute: 0, second: 0, millisecond: 0 })

  return {
    holdStartIso: end.toUTC().toISO(),
    holdEndIso: holdEndLocal.toUTC().toISO(),
    holdEndLocalIso: holdEndLocal.toISO()
  }
}
