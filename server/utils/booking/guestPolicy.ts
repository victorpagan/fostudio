import type { H3Event } from 'h3'
import { DateTime } from 'luxon'
import { getServerConfigMap } from '~~/server/utils/config/secret'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'

export type BookingRateKind = 'standard' | 'standby'
export type BookingAccountKind = 'guest' | 'member'

export type GuestBookingPolicy = {
  peakMultiplier: number
  ratePerCreditCents: number
  bookingWindowDays: number
  startHour: number
  endHour: number
  minBookingHours: number
  bookingIncrementMinutes: number
  creditExpiryDays: number
  pendingPaymentHoldMinutes: number
}

export type StandbyBookingPolicy = {
  enabled: boolean
  minOpenSlotHours: number
  discountMultiplier: number
  memberStartHour: number
  memberWindowHours: number
  guestWindowHours: number
}

export type StandbyWindow = {
  start: string
  end: string
}

export const DEFAULT_GUEST_POLICY: GuestBookingPolicy = {
  peakMultiplier: 2.5,
  ratePerCreditCents: 3500,
  bookingWindowDays: 20,
  startHour: 9,
  endHour: 21,
  minBookingHours: 2,
  bookingIncrementMinutes: 60,
  creditExpiryDays: 30,
  pendingPaymentHoldMinutes: 15
}

export const DEFAULT_STANDBY_POLICY: StandbyBookingPolicy = {
  enabled: true,
  minOpenSlotHours: 4,
  discountMultiplier: 0.5,
  memberStartHour: 8,
  memberWindowHours: 10,
  guestWindowHours: 6
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toInt(value: unknown, fallback: number) {
  return Math.floor(toNumber(value, fallback))
}

function toBool(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function clampHour(value: unknown, fallback: number) {
  return Math.max(0, Math.min(24, toInt(value, fallback)))
}

export function formatHourLabel(hour: number) {
  const normalized = Math.min(24, Math.max(0, Math.floor(hour)))
  if (normalized === 24) return '12:00 AM'
  return DateTime.fromObject({ year: 2026, month: 1, day: 1, hour: normalized }, { zone: STUDIO_TZ }).toFormat('h:mm a')
}

export async function loadGuestBookingPolicy(event: H3Event): Promise<GuestBookingPolicy> {
  const cfg = await getServerConfigMap(event, [
    'guest_peak_multiplier',
    'guest_booking_rate_per_credit_cents',
    'guest_booking_window_days',
    'guest_booking_start_hour',
    'guest_booking_end_hour',
    'guest_min_booking_hours',
    'guest_booking_increment_minutes',
    'guest_credit_expiry_days',
    'guest_pending_payment_hold_minutes'
  ])

  const startHour = clampHour(cfg.guest_booking_start_hour, DEFAULT_GUEST_POLICY.startHour)
  let endHour = clampHour(cfg.guest_booking_end_hour, DEFAULT_GUEST_POLICY.endHour)
  if (endHour <= startHour) endHour = Math.min(24, startHour + 1)

  return {
    peakMultiplier: Math.max(1, toNumber(cfg.guest_peak_multiplier, DEFAULT_GUEST_POLICY.peakMultiplier)),
    ratePerCreditCents: Math.max(100, toInt(cfg.guest_booking_rate_per_credit_cents, DEFAULT_GUEST_POLICY.ratePerCreditCents)),
    bookingWindowDays: Math.max(1, toInt(cfg.guest_booking_window_days, DEFAULT_GUEST_POLICY.bookingWindowDays)),
    startHour,
    endHour,
    minBookingHours: Math.max(0.5, toNumber(cfg.guest_min_booking_hours, DEFAULT_GUEST_POLICY.minBookingHours)),
    bookingIncrementMinutes: Math.max(15, toInt(cfg.guest_booking_increment_minutes, DEFAULT_GUEST_POLICY.bookingIncrementMinutes)),
    creditExpiryDays: Math.max(1, toInt(cfg.guest_credit_expiry_days, DEFAULT_GUEST_POLICY.creditExpiryDays)),
    pendingPaymentHoldMinutes: Math.max(1, toInt(cfg.guest_pending_payment_hold_minutes, DEFAULT_GUEST_POLICY.pendingPaymentHoldMinutes))
  }
}

export async function loadStandbyBookingPolicy(event: H3Event): Promise<StandbyBookingPolicy> {
  const cfg = await getServerConfigMap(event, [
    'standby_enabled',
    'standby_min_open_slot_hours',
    'standby_discount_multiplier',
    'member_standby_start_hour',
    'member_standby_window_hours',
    'guest_standby_window_hours'
  ])

  return {
    enabled: toBool(cfg.standby_enabled, DEFAULT_STANDBY_POLICY.enabled),
    minOpenSlotHours: Math.max(1, toNumber(cfg.standby_min_open_slot_hours, DEFAULT_STANDBY_POLICY.minOpenSlotHours)),
    discountMultiplier: Math.min(1, Math.max(0.05, toNumber(cfg.standby_discount_multiplier, DEFAULT_STANDBY_POLICY.discountMultiplier))),
    memberStartHour: clampHour(cfg.member_standby_start_hour, DEFAULT_STANDBY_POLICY.memberStartHour),
    memberWindowHours: Math.max(1, toNumber(cfg.member_standby_window_hours, DEFAULT_STANDBY_POLICY.memberWindowHours)),
    guestWindowHours: Math.max(1, toNumber(cfg.guest_standby_window_hours, DEFAULT_STANDBY_POLICY.guestWindowHours))
  }
}

export function toHourValue(dateTime: DateTime) {
  return dateTime.hour + (dateTime.minute / 60) + (dateTime.second / 3600)
}

export function isMinuteAligned(dateTime: DateTime, incrementMinutes: number) {
  if (!dateTime.isValid) return false
  if (dateTime.second !== 0 || dateTime.millisecond !== 0) return false
  return dateTime.minute % Math.max(1, Math.floor(incrementMinutes)) === 0
}

export function validateGuestBookingWindow(params: {
  start: DateTime
  end: DateTime
  now?: DateTime
  policy: GuestBookingPolicy
}) {
  const now = (params.now ?? DateTime.now().setZone(STUDIO_TZ)).setZone(STUDIO_TZ)
  const start = params.start.setZone(STUDIO_TZ)
  const end = params.end.setZone(STUDIO_TZ)
  const policy = params.policy

  if (!start.isValid || !end.isValid || !(start < end)) {
    return { ok: false, message: 'Select a valid booking time.' }
  }
  if (start < now) {
    return { ok: false, message: 'Cannot book in the past.' }
  }
  if (start > now.plus({ days: policy.bookingWindowDays })) {
    return { ok: false, message: `Guest bookings can only be made up to ${policy.bookingWindowDays} days ahead.` }
  }
  if (!start.hasSame(end, 'day')) {
    return { ok: false, message: 'Guest bookings must start and end on the same day.' }
  }

  const startHourValue = toHourValue(start)
  const endHourValue = toHourValue(end)
  if (startHourValue < policy.startHour || endHourValue > policy.endHour) {
    return {
      ok: false,
      message: `Guest bookings must start/end between ${formatHourLabel(policy.startHour)} and ${formatHourLabel(policy.endHour)} (Los Angeles time).`
    }
  }

  const durationHours = end.diff(start, 'hours').hours
  if (durationHours < policy.minBookingHours) {
    return { ok: false, message: `Guest bookings must be at least ${policy.minBookingHours} hours.` }
  }
  if (!isMinuteAligned(start, policy.bookingIncrementMinutes) || !isMinuteAligned(end, policy.bookingIncrementMinutes)) {
    return { ok: false, message: `Guest bookings must start and end on ${policy.bookingIncrementMinutes}-minute increments.` }
  }

  return { ok: true, message: null }
}

function roundUpToIncrement(dt: DateTime, incrementMinutes = 30) {
  const increment = Math.max(1, Math.floor(incrementMinutes))
  const minuteOfDay = dt.hour * 60 + dt.minute
  const rounded = Math.ceil(minuteOfDay / increment) * increment
  return dt.startOf('day').plus({ minutes: rounded })
}

export function getStandbyBaseWindow(params: {
  accountKind: BookingAccountKind
  now?: DateTime
  guestPolicy: GuestBookingPolicy
  standbyPolicy: StandbyBookingPolicy
}) {
  const now = (params.now ?? DateTime.now().setZone(STUDIO_TZ)).setZone(STUDIO_TZ)
  const dayStart = now.startOf('day')
  const midnight = dayStart.plus({ days: 1 })
  const earliestHour = params.accountKind === 'guest'
    ? params.guestPolicy.startHour
    : params.standbyPolicy.memberStartHour
  const latestHardEnd = params.accountKind === 'guest'
    ? dayStart.set({ hour: params.guestPolicy.endHour, minute: 0, second: 0, millisecond: 0 })
    : midnight
  const earliest = dayStart.set({ hour: earliestHour, minute: 0, second: 0, millisecond: 0 })
  const start = DateTime.max(earliest, roundUpToIncrement(now, 30))
  const reachHours = params.accountKind === 'guest'
    ? params.standbyPolicy.guestWindowHours
    : params.standbyPolicy.memberWindowHours
  const end = DateTime.min(start.plus({ hours: reachHours }), latestHardEnd, midnight)
  return { start, end }
}

export function validateStandbySelection(params: {
  start: DateTime
  end: DateTime
  accountKind: BookingAccountKind
  guestPolicy: GuestBookingPolicy
  standbyPolicy: StandbyBookingPolicy
  now?: DateTime
}) {
  const now = (params.now ?? DateTime.now().setZone(STUDIO_TZ)).setZone(STUDIO_TZ)
  const start = params.start.setZone(STUDIO_TZ)
  const end = params.end.setZone(STUDIO_TZ)

  if (!params.standbyPolicy.enabled) return { ok: false, message: 'Standby booking is not enabled.' }
  if (!start.hasSame(now, 'day') || !end.hasSame(now, 'day')) {
    return { ok: false, message: 'Standby bookings are same-day only.' }
  }
  const durationHours = end.diff(start, 'hours').hours
  if (durationHours < params.standbyPolicy.minOpenSlotHours) {
    return { ok: false, message: `Standby bookings require at least ${params.standbyPolicy.minOpenSlotHours} hours.` }
  }
  const window = getStandbyBaseWindow({
    accountKind: params.accountKind,
    now,
    guestPolicy: params.guestPolicy,
    standbyPolicy: params.standbyPolicy
  })
  if (start < window.start || end > window.end) {
    return {
      ok: false,
      message: `Standby must fit within today's standby window: ${window.start.toFormat('h:mm a')} to ${window.end.toFormat('h:mm a')}.`
    }
  }
  return { ok: true, message: null }
}

export function computeStandbyOpenWindows(params: {
  accountKind: BookingAccountKind
  guestPolicy: GuestBookingPolicy
  standbyPolicy: StandbyBookingPolicy
  busy: Array<{ start: string, end: string }>
  now?: DateTime
}) {
  if (!params.standbyPolicy.enabled) return []
  const base = getStandbyBaseWindow(params)
  if (!(base.end > base.start)) return []

  const busyIntervals = params.busy
    .map((row) => {
      const start = DateTime.fromISO(row.start, { setZone: true }).setZone(STUDIO_TZ)
      const end = DateTime.fromISO(row.end, { setZone: true }).setZone(STUDIO_TZ)
      if (!start.isValid || !end.isValid || end <= start) return null
      const clippedStart = start > base.start ? start : base.start
      const clippedEnd = end < base.end ? end : base.end
      if (clippedEnd <= clippedStart) return null
      return { start: clippedStart, end: clippedEnd }
    })
    .filter((row): row is { start: DateTime, end: DateTime } => Boolean(row))
    .sort((left, right) => left.start.toMillis() - right.start.toMillis())

  const windows: StandbyWindow[] = []
  let cursor = base.start
  for (const interval of busyIntervals) {
    if (interval.start > cursor) {
      const hours = interval.start.diff(cursor, 'hours').hours
      if (hours >= params.standbyPolicy.minOpenSlotHours) {
        windows.push({ start: cursor.toUTC().toISO()!, end: interval.start.toUTC().toISO()! })
      }
    }
    if (interval.end > cursor) cursor = interval.end
  }

  if (base.end > cursor && base.end.diff(cursor, 'hours').hours >= params.standbyPolicy.minOpenSlotHours) {
    windows.push({ start: cursor.toUTC().toISO()!, end: base.end.toUTC().toISO()! })
  }

  return windows
}

export function buildRatePolicySnapshot(params: {
  accountKind: BookingAccountKind
  rateKind: BookingRateKind
  guestPolicy?: GuestBookingPolicy | null
  standbyPolicy?: StandbyBookingPolicy | null
}) {
  return {
    account_kind: params.accountKind,
    booking_rate_kind: params.rateKind,
    guest_policy: params.guestPolicy ?? null,
    standby_policy: params.standbyPolicy ?? null,
    captured_at: new Date().toISOString()
  }
}
