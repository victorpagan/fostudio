import { DateTime } from 'luxon'

const STUDIO_TIME_ZONE = 'America/Los_Angeles'

export const DEFAULT_BOOKING_END_REMINDER_MINUTES = 15
export const DEFAULT_ABODE_BOOKING_END_ARM_DELAY_MINUTES = 60
export const DEFAULT_ABODE_BOOKING_END_EARLY_HOUR = 11
export const DEFAULT_ABODE_BOOKING_END_LATE_HOUR = 21

export function shouldScheduleAbodeArmAfterBookingEnd(
  endIso: string,
  options?: {
    earlyHour?: number
    lateHour?: number
  }
) {
  const end = DateTime.fromISO(endIso, { setZone: true }).setZone(STUDIO_TIME_ZONE)
  if (!end.isValid) throw new Error('Invalid booking end time')

  const earlyHour = Math.max(0, Math.min(23, Math.floor(
    Number(options?.earlyHour ?? DEFAULT_ABODE_BOOKING_END_EARLY_HOUR)
  )))
  const lateHour = Math.max(0, Math.min(23, Math.floor(
    Number(options?.lateHour ?? DEFAULT_ABODE_BOOKING_END_LATE_HOUR)
  )))

  return end.hour < earlyHour || end.hour >= lateHour
}

export function computeBookingEndJobTimes(endIso: string, options?: {
  reminderMinutes?: number
  armDelayMinutes?: number
}) {
  const end = DateTime.fromISO(endIso, { setZone: true }).setZone(STUDIO_TIME_ZONE)
  if (!end.isValid) throw new Error('Invalid booking end time')

  const reminderMinutes = Math.max(1, Math.floor(Number(
    options?.reminderMinutes ?? DEFAULT_BOOKING_END_REMINDER_MINUTES
  )))
  const armDelayMinutes = Math.max(0, Math.floor(Number(
    options?.armDelayMinutes ?? DEFAULT_ABODE_BOOKING_END_ARM_DELAY_MINUTES
  )))

  return {
    reminderAt: end.minus({ minutes: reminderMinutes }),
    reminderAtIso: end.minus({ minutes: reminderMinutes }).toUTC().toISO(),
    armAt: end.plus({ minutes: armDelayMinutes }),
    armAtIso: end.plus({ minutes: armDelayMinutes }).toUTC().toISO()
  }
}
