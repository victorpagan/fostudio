import { DateTime } from 'luxon'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'

export const ACCESS_WINDOW_LEAD_MINUTES = 30
export const ACCESS_WINDOW_TRAIL_MINUTES = 30

export function isAccessEligibleBookingStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()
  return normalized === 'confirmed' || normalized === 'requested'
}

export function computeAccessWindow(startIso: string, endIso: string) {
  const start = DateTime.fromISO(startIso, { setZone: true }).setZone(STUDIO_TZ)
  const end = DateTime.fromISO(endIso, { setZone: true }).setZone(STUDIO_TZ)

  if (!start.isValid || !end.isValid || !(start < end)) {
    throw new Error('Invalid booking time window')
  }

  const activateAt = start.minus({ minutes: ACCESS_WINDOW_LEAD_MINUTES })
  const deactivateAt = end.plus({ minutes: ACCESS_WINDOW_TRAIL_MINUTES })

  return {
    activateAtIso: activateAt.toUTC().toISO(),
    deactivateAtIso: deactivateAt.toUTC().toISO(),
    activateAt,
    deactivateAt
  }
}

export function isInsideAccessWindow(startIso: string, endIso: string, now = DateTime.now().setZone(STUDIO_TZ)) {
  const { activateAt, deactivateAt } = computeAccessWindow(startIso, endIso)
  return now >= activateAt && now <= deactivateAt
}

export function isOutsideAbodeArmingGap(now = DateTime.now().setZone(STUDIO_TZ)) {
  const hour = now.hour
  return hour < 11 || hour >= 19
}
