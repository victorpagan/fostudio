import { DateTime } from 'luxon'
import type { H3Event } from 'h3'
import { getServerConfigMap } from '~~/server/utils/config/secret'

export const STUDIO_TZ = 'America/Los_Angeles'
const DEFAULT_DAYS = [1, 2, 3, 4]
const DEFAULT_START_HOUR = 11
const DEFAULT_END_HOUR = 16

export type PeakWindowConfig = {
  timezone: string
  days: number[]
  startHour: number
  endHour: number
}

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeDays(value: unknown): number[] {
  const candidate = Array.isArray(value) ? value : DEFAULT_DAYS
  const normalized = candidate
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7)
  return normalized.length ? [...new Set(normalized)].sort((a, b) => a - b) : DEFAULT_DAYS
}

function formatDaysLabel(days: number[]) {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const mapped = days.map(day => labels[day - 1]).filter(Boolean)
  return mapped.join(', ')
}

function formatHourLabel(hour: number) {
  const normalized = Math.max(0, Math.min(24, hour))
  const h = normalized % 12 === 0 ? 12 : normalized % 12
  const period = normalized < 12 ? 'AM' : 'PM'
  return `${h} ${period}`
}

export async function loadPeakWindowConfig(event: H3Event): Promise<PeakWindowConfig> {
  const cfg = await getServerConfigMap(event, [
    'peak_days',
    'peak_start_hour',
    'peak_end_hour'
  ])

  let startHour = asNumber(cfg.peak_start_hour, DEFAULT_START_HOUR)
  let endHour = asNumber(cfg.peak_end_hour, DEFAULT_END_HOUR)
  if (endHour <= startHour) endHour = startHour + 1
  startHour = Math.max(0, Math.min(23, Math.floor(startHour)))
  endHour = Math.max(startHour + 1, Math.min(24, Math.floor(endHour)))

  return {
    timezone: STUDIO_TZ,
    days: normalizeDays(cfg.peak_days),
    startHour,
    endHour
  }
}

export function isPeakByConfig(dt: DateTime, cfg: PeakWindowConfig) {
  const local = dt.setZone(cfg.timezone)
  const hour = local.hour + local.minute / 60
  return cfg.days.includes(local.weekday) && hour >= cfg.startHour && hour < cfg.endHour
}

export function toPeakWindowPayload(cfg: PeakWindowConfig, multiplier: number | null) {
  return {
    timezone: cfg.timezone,
    daysLabel: formatDaysLabel(cfg.days),
    windowLabel: `${formatHourLabel(cfg.startHour)}-${formatHourLabel(cfg.endHour)}`,
    multiplier
  }
}
