import { DateTime } from 'luxon'

export const ADMIN_TIME_ZONE = 'America/Los_Angeles'
const DATETIME_INPUT_FORMAT = 'yyyy-LL-dd\'T\'HH:mm'

function parseIso(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null

  const parsedIso = DateTime.fromISO(normalized, { setZone: true })
  if (parsedIso.isValid) return parsedIso

  const parsedSql = DateTime.fromSQL(normalized, { zone: 'utc' })
  return parsedSql.isValid ? parsedSql : null
}

export function formatAdminDateTime(value: string | null | undefined, fallback = '—') {
  const parsed = parseIso(value)
  if (!parsed) return value ? String(value) : fallback
  return parsed.setZone(ADMIN_TIME_ZONE).toFormat('LLL d, yyyy, h:mm a')
}

export function formatAdminDate(value: string | null | undefined, fallback = '—') {
  const parsed = parseIso(value)
  if (!parsed) return value ? String(value) : fallback
  return parsed.setZone(ADMIN_TIME_ZONE).toFormat('LLL d, yyyy')
}

export function isoToAdminDatetimeInput(value: string | null | undefined) {
  const parsed = parseIso(value)
  if (!parsed) return ''
  return parsed.setZone(ADMIN_TIME_ZONE).toFormat(DATETIME_INPUT_FORMAT)
}

export function isoToAdminDateInput(value: string | null | undefined) {
  const parsed = parseIso(value)
  if (!parsed) return ''
  return parsed.setZone(ADMIN_TIME_ZONE).toISODate() ?? ''
}

export function adminDatetimeInputToIso(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null

  const parsed = DateTime.fromFormat(normalized, DATETIME_INPUT_FORMAT, {
    zone: ADMIN_TIME_ZONE,
    setZone: true
  })

  // Reject normalized DST-gap values instead of silently moving the requested wall time.
  if (!parsed.isValid || parsed.toFormat(DATETIME_INPUT_FORMAT) !== normalized) return null
  return parsed.toUTC().toISO()
}

export function adminDateInputToIso(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null

  const parsed = DateTime.fromFormat(normalized, 'yyyy-LL-dd', {
    zone: ADMIN_TIME_ZONE,
    setZone: true
  })
  if (!parsed.isValid || parsed.toFormat('yyyy-LL-dd') !== normalized) return null
  return parsed.startOf('day').toUTC().toISO()
}

export function adminTodayInput() {
  return DateTime.now().setZone(ADMIN_TIME_ZONE).toISODate() ?? ''
}
