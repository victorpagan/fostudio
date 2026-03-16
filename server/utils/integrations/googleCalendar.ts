import { createSign } from 'node:crypto'
import { DateTime } from 'luxon'
import type { H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { getKey, getServerConfigMap, refreshServerConfig } from '~~/server/utils/config/secret'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'

type SupabaseLike = {
  from: (table: string) => any
}

type GoogleServiceAccount = {
  client_email: string
  private_key: string
}

type GoogleCalendarEventTime = {
  dateTime?: string
  date?: string
}

type GoogleCalendarEvent = {
  id?: string
  status?: string
  summary?: string
  description?: string
  location?: string
  start?: GoogleCalendarEventTime
  end?: GoogleCalendarEventTime
}

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const GOOGLE_TOKEN_AUD = 'https://oauth2.googleapis.com/token'
const GOOGLE_EVENTS_API = 'https://www.googleapis.com/calendar/v3/calendars'

export type GoogleCalendarSyncSettings = {
  enabled: boolean
  calendarId: string
  serviceAccountSecretName: string
  lookbackDays: number
  lookaheadDays: number
  syncIntervalMinutes: number
  lastSyncAt: string | null
  lastSyncStatus: unknown
}

export type GoogleCalendarSyncResult = {
  ok: boolean
  skipped: boolean
  reason: string
  fetchedEvents: number
  upsertedRows: number
  deactivatedRows: number
  windowStart: string | null
  windowEnd: string | null
  syncedAt: string
  dryRun: boolean
}

const SETTINGS_KEYS = [
  'gcal_sync_enabled',
  'gcal_calendar_id',
  'gcal_service_account_secret_name',
  'gcal_sync_lookback_days',
  'gcal_sync_lookahead_days',
  'gcal_sync_interval_minutes',
  'gcal_last_sync_at',
  'gcal_last_sync_status'
] as const

let inFlightAutoSync: Promise<GoogleCalendarSyncResult> | null = null

function asBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return fallback
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function asInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function asString(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  return value.trim() || fallback
}

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '')
}

function signJwtRS256(payload: Record<string, unknown>, privateKey: string) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const unsigned = `${encodedHeader}.${encodedPayload}`

  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(privateKey)
  return `${unsigned}.${base64UrlEncode(signature)}`
}

function normalizeServiceAccount(secretValue: unknown): GoogleServiceAccount {
  const raw = typeof secretValue === 'string'
    ? JSON.parse(secretValue)
    : secretValue

  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid Google service account secret payload')
  }

  const serviceAccount = raw as Record<string, unknown>
  const clientEmail = asString(serviceAccount.client_email)
  const privateKey = asString(serviceAccount.private_key).replaceAll('\\n', '\n')

  if (!clientEmail || !privateKey) {
    throw new Error('Google service account is missing client_email or private_key')
  }

  return {
    client_email: clientEmail,
    private_key: privateKey
  }
}

function normalizeEventTime(time: GoogleCalendarEventTime | undefined, asEnd: boolean) {
  if (!time) return null
  if (time.dateTime) {
    const dt = DateTime.fromISO(time.dateTime, { setZone: true })
    return dt.isValid ? dt.toUTC().toISO() : null
  }
  if (time.date) {
    const dt = DateTime.fromISO(time.date, { zone: STUDIO_TZ })
    if (!dt.isValid) return null
    const normalized = asEnd ? dt : dt.startOf('day')
    return normalized.toUTC().toISO()
  }
  return null
}

async function exchangeGoogleAccessToken(serviceAccount: GoogleServiceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const assertion = signJwtRS256({
    iss: serviceAccount.client_email,
    scope: GOOGLE_SCOPE,
    aud: GOOGLE_TOKEN_AUD,
    iat: now,
    exp: now + 3600
  }, serviceAccount.private_key)

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  })

  const response = await fetch(GOOGLE_TOKEN_AUD, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google token exchange failed (${response.status}): ${text}`)
  }

  const tokenRes = await response.json() as { access_token?: string }
  const accessToken = asString(tokenRes.access_token)
  if (!accessToken) throw new Error('Google token exchange returned no access_token')
  return accessToken
}

async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string
) {
  const allEvents: GoogleCalendarEvent[] = []
  let pageToken: string | null = null

  do {
    const qs = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      showDeleted: 'true',
      maxResults: '2500',
      timeMin: timeMinIso,
      timeMax: timeMaxIso
    })
    if (pageToken) qs.set('pageToken', pageToken)

    const url = `${GOOGLE_EVENTS_API}/${encodeURIComponent(calendarId)}/events?${qs.toString()}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Google events fetch failed (${response.status}): ${text}`)
    }

    const payload = await response.json() as {
      items?: GoogleCalendarEvent[]
      nextPageToken?: string
    }
    allEvents.push(...(payload.items ?? []))
    pageToken = asString(payload.nextPageToken) || null
  } while (pageToken)

  return allEvents
}

async function writeSyncStatus(
  db: SupabaseLike,
  syncedAt: string,
  statusValue: Record<string, unknown>
) {
  const { error } = await db
    .from('system_config')
    .upsert([
      { key: 'gcal_last_sync_at', value: syncedAt },
      { key: 'gcal_last_sync_status', value: statusValue }
    ], { onConflict: 'key' })

  if (error) throw new Error(error.message)
  await refreshServerConfig()
}

function splitIntoChunks<T>(items: T[], size: number) {
  if (items.length <= size) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function getGoogleCalendarSyncSettings(event: H3Event): Promise<GoogleCalendarSyncSettings> {
  const config = await getServerConfigMap(event, [...SETTINGS_KEYS])

  return {
    enabled: asBoolean(config.gcal_sync_enabled, false),
    calendarId: asString(config.gcal_calendar_id),
    serviceAccountSecretName: asString(config.gcal_service_account_secret_name, 'GOOGLE_SERVICE_ACCOUNT_JSON'),
    lookbackDays: asInteger(config.gcal_sync_lookback_days, 14, 0, 365),
    lookaheadDays: asInteger(config.gcal_sync_lookahead_days, 180, 1, 730),
    syncIntervalMinutes: asInteger(config.gcal_sync_interval_minutes, 5, 1, 1440),
    lastSyncAt: typeof config.gcal_last_sync_at === 'string' ? config.gcal_last_sync_at : null,
    lastSyncStatus: config.gcal_last_sync_status ?? null
  }
}

export async function syncGoogleCalendarToExternalBlocks(
  event: H3Event,
  options?: {
    force?: boolean
    dryRun?: boolean
    reason?: string
  }
): Promise<GoogleCalendarSyncResult> {
  const force = Boolean(options?.force)
  const dryRun = Boolean(options?.dryRun)
  const reason = asString(options?.reason, 'manual')
  const syncedAt = new Date().toISOString()

  const settings = await getGoogleCalendarSyncSettings(event)
  if (!settings.enabled) {
    return {
      ok: true,
      skipped: true,
      reason: 'disabled',
      fetchedEvents: 0,
      upsertedRows: 0,
      deactivatedRows: 0,
      windowStart: null,
      windowEnd: null,
      syncedAt,
      dryRun
    }
  }

  if (!settings.calendarId) {
    throw new Error('Google Calendar sync is enabled but calendar ID is missing')
  }

  if (!force && settings.lastSyncAt) {
    const lastSyncMs = Date.parse(settings.lastSyncAt)
    if (!Number.isNaN(lastSyncMs)) {
      const intervalMs = settings.syncIntervalMinutes * 60_000
      if (Date.now() - lastSyncMs < intervalMs) {
        return {
          ok: true,
          skipped: true,
          reason: 'cooldown',
          fetchedEvents: 0,
          upsertedRows: 0,
          deactivatedRows: 0,
          windowStart: null,
          windowEnd: null,
          syncedAt,
          dryRun
        }
      }
    }
  }

  const serviceSecretRaw = await getKey(event, settings.serviceAccountSecretName)
  const serviceAccount = normalizeServiceAccount(serviceSecretRaw)
  const accessToken = await exchangeGoogleAccessToken(serviceAccount)

  const nowStudio = DateTime.now().setZone(STUDIO_TZ)
  const windowStart = nowStudio.minus({ days: settings.lookbackDays }).startOf('day').toUTC()
  const windowEnd = nowStudio.plus({ days: settings.lookaheadDays }).endOf('day').toUTC()
  const windowStartIso = windowStart.toISO()
  const windowEndIso = windowEnd.toISO()
  if (!windowStartIso || !windowEndIso) throw new Error('Could not resolve Google sync window')

  const googleEvents = await fetchGoogleCalendarEvents(
    accessToken,
    settings.calendarId,
    windowStartIso,
    windowEndIso
  )

  const rows = googleEvents
    .map((entry) => {
      const externalEventId = asString(entry.id)
      const startIso = normalizeEventTime(entry.start, false)
      const endIso = normalizeEventTime(entry.end, true)
      if (!externalEventId || !startIso || !endIso) return null
      if (Date.parse(endIso) <= Date.parse(startIso)) return null
      const status = asString(entry.status, 'confirmed')
      const title = asString(entry.summary, 'Peerspace booking')
      const description = asString(entry.description) || null
      const location = asString(entry.location) || null

      return {
        provider: 'google',
        calendar_id: settings.calendarId,
        external_event_id: externalEventId,
        title,
        description,
        location,
        status,
        start_time: startIso,
        end_time: endIso,
        active: status !== 'cancelled',
        raw_payload: entry,
        synced_at: syncedAt
      }
    })
    .filter(Boolean) as Array<Record<string, unknown>>

  let deactivatedRows = 0
  const db = serverSupabaseServiceRole(event) as any

  if (!dryRun) {
    const deactivateRes = await db
      .from('external_calendar_events')
      .update({
        active: false,
        status: 'canceled',
        synced_at: syncedAt
      })
      .eq('provider', 'google')
      .eq('calendar_id', settings.calendarId)
      .eq('active', true)
      .lt('start_time', windowEndIso)
      .gt('end_time', windowStartIso)
      .select('id', { head: true, count: 'exact' })
    if (deactivateRes.error) throw new Error(deactivateRes.error.message)
    deactivatedRows = Number(deactivateRes.count ?? 0)

    for (const chunk of splitIntoChunks(rows, 250)) {
      const { error } = await db
        .from('external_calendar_events')
        .upsert(chunk, {
          onConflict: 'provider,calendar_id,external_event_id'
        })
      if (error) throw new Error(error.message)
    }

    await writeSyncStatus(db, syncedAt, {
      ok: true,
      reason,
      fetchedEvents: googleEvents.length,
      upsertedRows: rows.length,
      deactivatedRows,
      dryRun: false,
      windowStart: windowStartIso,
      windowEnd: windowEndIso,
      syncedAt
    })
  }

  return {
    ok: true,
    skipped: false,
    reason,
    fetchedEvents: googleEvents.length,
    upsertedRows: rows.length,
    deactivatedRows,
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
    syncedAt,
    dryRun
  }
}

export async function maybeAutoSyncGoogleCalendar(event: H3Event, reason = 'calendar_read') {
  if (inFlightAutoSync) return inFlightAutoSync

  inFlightAutoSync = syncGoogleCalendarToExternalBlocks(event, {
    force: false,
    dryRun: false,
    reason
  })
    .catch(async (error: unknown) => {
      try {
        const db = serverSupabaseServiceRole(event) as any
        const syncedAt = new Date().toISOString()
        await writeSyncStatus(db, syncedAt, {
          ok: false,
          reason,
          error: error instanceof Error ? error.message : String(error),
          syncedAt
        })
      } catch (statusError) {
        console.error('[gcal-sync] failed to write error status', statusError)
      }
      throw error
    })
    .finally(() => {
      inFlightAutoSync = null
    })

  return inFlightAutoSync
}
