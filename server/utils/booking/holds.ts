import { DateTime } from 'luxon'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'

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

export function computeOvernightHoldWindow(end: DateTime, peakStartHour: number) {
  const localEnd = end.setZone(STUDIO_TZ)
  const nextDay = localEnd.startOf('day').plus({ days: 1 })
  const nextDayTenAm = nextDay.set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
  const safePeakStartHour = Math.max(0, Math.min(23, Math.floor(peakStartHour)))
  const nextDayPeakStart = nextDay.set({ hour: safePeakStartHour, minute: 0, second: 0, millisecond: 0 })
  const holdEndLocal = nextDayPeakStart < nextDayTenAm ? nextDayPeakStart : nextDayTenAm

  return {
    holdStartIso: end.toUTC().toISO(),
    holdEndIso: holdEndLocal.toUTC().toISO(),
    holdEndLocalIso: holdEndLocal.toISO()
  }
}
