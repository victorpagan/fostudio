import { createSign, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { getRequestURL, type H3Event } from 'h3'
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
  transparency?: string
  extendedProperties?: {
    private?: Record<string, string>
  }
  start?: GoogleCalendarEventTime
  end?: GoogleCalendarEventTime
}

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar'
const GOOGLE_TOKEN_AUD = 'https://oauth2.googleapis.com/token'
const GOOGLE_EVENTS_API = 'https://www.googleapis.com/calendar/v3/calendars'

export type GoogleCalendarSyncSettings = {
  enabled: boolean
  pushEnabled: boolean
  calendarId: string
  serviceAccountSecretName: string
  oauthClientId: string
  oauthClientSecretName: string
  oauthConnected: boolean
  oauthConnectedEmail: string | null
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
  pushedRows: number
  deletedManagedRows: number
  windowStart: string | null
  windowEnd: string | null
  syncedAt: string
  dryRun: boolean
}

export type GoogleCalendarListEntry = {
  id: string
  summary: string
  primary: boolean
  accessRole: string
}

const SETTINGS_KEYS = [
  'gcal_sync_enabled',
  'gcal_push_enabled',
  'gcal_calendar_id',
  'gcal_service_account_secret_name',
  'gcal_oauth_client_id',
  'gcal_oauth_client_secret_name',
  'gcal_oauth_refresh_token',
  'gcal_oauth_access_token',
  'gcal_oauth_access_token_expires_at',
  'gcal_oauth_connected_email',
  'gcal_oauth_state',
  'gcal_oauth_state_expires_at',
  'gcal_sync_lookback_days',
  'gcal_sync_lookahead_days',
  'gcal_sync_interval_minutes',
  'gcal_last_sync_at',
  'gcal_last_sync_status'
] as const

let inFlightAutoSync: Promise<GoogleCalendarSyncResult> | null = null
let inFlightForcedSync: Promise<GoogleCalendarSyncResult> | null = null

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

function isGoogleNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const message = (error as { message?: string }).message
  return typeof message === 'string'
    && (
      /\bfailed \((404|410)\)\b/i.test(message)
      || /"reason"\s*:\s*"(notFound|deleted)"/i.test(message)
    )
}

function decodeJwtPayload(idToken: string): Record<string, unknown> | null {
  try {
    const parts = idToken.split('.')
    if (parts.length < 2) return null
    const payload = parts[1]
    if (!payload) return null
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = Buffer.from(padded, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

async function setSystemConfigValues(db: SupabaseLike, rows: Array<{ key: string, value: unknown }>) {
  for (const row of rows) {
    if (row.value === null || row.value === undefined) {
      const deleteRes = await db
        .from('system_config')
        .delete()
        .eq('key', row.key)
      if (deleteRes.error) throw new Error(deleteRes.error.message)
      continue
    }

    const updateRes = await db
      .from('system_config')
      .update({ value: row.value })
      .eq('key', row.key)
      .select('key')

    if (updateRes.error) throw new Error(updateRes.error.message)
    if ((updateRes.data?.length ?? 0) > 0) continue

    const insertRes = await db
      .from('system_config')
      .insert(row)
    if (insertRes.error) throw new Error(insertRes.error.message)
  }
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

async function exchangeGoogleOauthCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
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
    throw new Error(`Google OAuth code exchange failed (${response.status}): ${text}`)
  }

  return await response.json() as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    id_token?: string
    scope?: string
  }
}

async function refreshGoogleOauthAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
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
    throw new Error(`Google OAuth token refresh failed (${response.status}): ${text}`)
  }

  return await response.json() as {
    access_token?: string
    expires_in?: number
    refresh_token?: string
    scope?: string
    id_token?: string
  }
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

async function fetchGoogleCalendarList(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const calendars: GoogleCalendarListEntry[] = []
  let pageToken: string | null = null

  do {
    const qs = new URLSearchParams({
      maxResults: '250',
      showHidden: 'false',
      showDeleted: 'false'
    })
    if (pageToken) qs.set('pageToken', pageToken)

    const url = `https://www.googleapis.com/calendar/v3/users/me/calendarList?${qs.toString()}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Google calendar list fetch failed (${response.status}): ${text}`)
    }

    const payload = await response.json() as {
      items?: Array<{
        id?: string
        summary?: string
        primary?: boolean
        accessRole?: string
      }>
      nextPageToken?: string
    }

    for (const entry of payload.items ?? []) {
      const id = asString(entry.id)
      if (!id) continue
      calendars.push({
        id,
        summary: asString(entry.summary, id),
        primary: Boolean(entry.primary),
        accessRole: asString(entry.accessRole, 'reader')
      })
    }

    pageToken = asString(payload.nextPageToken) || null
  } while (pageToken)

  calendars.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary ? -1 : 1
    return a.summary.localeCompare(b.summary)
  })

  return calendars
}

async function insertGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  payload: Record<string, unknown>
) {
  const url = `${GOOGLE_EVENTS_API}/${encodeURIComponent(calendarId)}/events`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google event create failed (${response.status}): ${text}`)
  }

  return await response.json() as GoogleCalendarEvent
}

async function patchGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  payload: Record<string, unknown>
) {
  const url = `${GOOGLE_EVENTS_API}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google event patch failed (${response.status}): ${text}`)
  }
}

async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
) {
  const url = `${GOOGLE_EVENTS_API}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const text = await response.text()
    throw new Error(`Google event delete failed (${response.status}): ${text}`)
  }
}

async function writeSyncStatus(
  db: SupabaseLike,
  syncedAt: string,
  statusValue: Record<string, unknown>
) {
  await setSystemConfigValues(db, [
    { key: 'gcal_last_sync_at', value: syncedAt },
    { key: 'gcal_last_sync_status', value: statusValue }
  ])
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
  const connectedEmail = asString(config.gcal_oauth_connected_email) || null

  return {
    enabled: asBoolean(config.gcal_sync_enabled, false),
    pushEnabled: asBoolean(config.gcal_push_enabled, false),
    calendarId: asString(config.gcal_calendar_id),
    serviceAccountSecretName: asString(config.gcal_service_account_secret_name, 'GOOGLE_SERVICE_ACCOUNT_JSON'),
    oauthClientId: asString(config.gcal_oauth_client_id),
    oauthClientSecretName: asString(config.gcal_oauth_client_secret_name, 'GOOGLE_OAUTH_CLIENT_SECRET'),
    oauthConnected: Boolean(asString(config.gcal_oauth_refresh_token)),
    oauthConnectedEmail: connectedEmail,
    lookbackDays: asInteger(config.gcal_sync_lookback_days, 14, 0, 365),
    lookaheadDays: asInteger(config.gcal_sync_lookahead_days, 180, 1, 730),
    syncIntervalMinutes: asInteger(config.gcal_sync_interval_minutes, 5, 1, 1440),
    lastSyncAt: typeof config.gcal_last_sync_at === 'string' ? config.gcal_last_sync_at : null,
    lastSyncStatus: config.gcal_last_sync_status ?? null
  }
}

async function collectLocalBusyWindows(db: SupabaseLike, windowStartIso: string, windowEndIso: string) {
  const [bookingsRes, blocksRes, holdsRes] = await Promise.all([
    db
      .from('bookings')
      .select('id,start_time,end_time,status,notes')
      .in('status', ['confirmed', 'requested', 'pending_payment'])
      .lt('start_time', windowEndIso)
      .gt('end_time', windowStartIso),
    db
      .from('calendar_blocks')
      .select('id,start_time,end_time,reason')
      .eq('active', true)
      .lt('start_time', windowEndIso)
      .gt('end_time', windowStartIso),
    db
      .from('booking_holds')
      .select('id,booking_id,hold_start,hold_end,hold_type,bookings!inner(status)')
      .in('bookings.status', ['confirmed', 'requested', 'pending_payment'])
      .lt('hold_start', windowEndIso)
      .gt('hold_end', windowStartIso)
  ])

  if (bookingsRes.error) throw new Error(bookingsRes.error.message)
  if (blocksRes.error) throw new Error(blocksRes.error.message)
  if (holdsRes.error) throw new Error(holdsRes.error.message)

  const localEvents: Array<{
    sourceKey: string
    summary: string
    description: string
    startTime: string
    endTime: string
  }> = []

  for (const booking of (bookingsRes.data ?? [])) {
    localEvents.push({
      sourceKey: `booking:${booking.id}`,
      summary: 'FO Studio Booking',
      description: booking.notes ? String(booking.notes) : 'Studio booking (managed by FO Studio)',
      startTime: String(booking.start_time),
      endTime: String(booking.end_time)
    })
  }

  for (const block of (blocksRes.data ?? [])) {
    localEvents.push({
      sourceKey: `block:${block.id}`,
      summary: 'FO Studio Block',
      description: block.reason ? String(block.reason) : 'Studio block (managed by FO Studio)',
      startTime: String(block.start_time),
      endTime: String(block.end_time)
    })
  }

  for (const hold of (holdsRes.data ?? [])) {
    localEvents.push({
      sourceKey: `hold:${hold.id}`,
      summary: 'FO Studio Equipment Hold',
      description: hold.hold_type
        ? `Equipment hold (${String(hold.hold_type)}) managed by FO Studio`
        : 'Equipment hold managed by FO Studio',
      startTime: String(hold.hold_start),
      endTime: String(hold.hold_end)
    })
  }

  return localEvents
}

export async function buildGoogleOauthConnectUrl(event: H3Event) {
  const settings = await getGoogleCalendarSyncSettings(event)
  if (!settings.oauthClientId) {
    throw new Error('Google OAuth client ID is missing. Set gcal_oauth_client_id in admin settings first.')
  }
  if (!settings.oauthClientSecretName) {
    throw new Error('Google OAuth client secret key name is missing. Set gcal_oauth_client_secret_name first.')
  }

  const origin = getRequestURL(event).origin
  const redirectUri = `${origin}/api/admin/google-calendar/oauth/callback`
  const state = randomUUID()
  const stateExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
  const db = serverSupabaseServiceRole(event) as any
  await setSystemConfigValues(db, [
    { key: 'gcal_oauth_state', value: state },
    { key: 'gcal_oauth_state_expires_at', value: stateExpiresAt }
  ])
  await refreshServerConfig()

  const qs = new URLSearchParams({
    client_id: settings.oauthClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar openid email',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${qs.toString()}`
}

export async function completeGoogleOauthConnect(event: H3Event, params: { code: string, state: string }) {
  const { code, state } = params
  const settings = await getGoogleCalendarSyncSettings(event)
  if (!settings.oauthClientId) {
    throw new Error('Google OAuth client ID is missing. Set gcal_oauth_client_id first.')
  }

  const config = await getServerConfigMap(event, ['gcal_oauth_state', 'gcal_oauth_state_expires_at'])
  const expectedState = asString(config.gcal_oauth_state)
  const stateExpiryRaw = asString(config.gcal_oauth_state_expires_at)
  const stateExpiryMs = stateExpiryRaw ? Date.parse(stateExpiryRaw) : Number.NaN
  if (!expectedState || expectedState !== state) {
    throw new Error('OAuth state mismatch. Start the Google connect flow again.')
  }
  if (!Number.isNaN(stateExpiryMs) && Date.now() > stateExpiryMs) {
    throw new Error('OAuth connect state expired. Start the flow again.')
  }

  const clientSecretRaw = await getKey(event, settings.oauthClientSecretName || 'GOOGLE_OAUTH_CLIENT_SECRET')
  const clientSecret = asString(clientSecretRaw)
  if (!clientSecret) {
    throw new Error('Google OAuth client secret is missing in secrets store.')
  }

  const origin = getRequestURL(event).origin
  const redirectUri = `${origin}/api/admin/google-calendar/oauth/callback`
  const tokenRes = await exchangeGoogleOauthCode(settings.oauthClientId, clientSecret, code, redirectUri)
  const refreshToken = asString(tokenRes.refresh_token)
  if (!refreshToken) {
    throw new Error('Google OAuth did not return a refresh token. Reconnect and consent again.')
  }
  const accessToken = asString(tokenRes.access_token)
  const expiresIn = Number(tokenRes.expires_in ?? 3600)
  const expiresAtIso = new Date(Date.now() + Math.max(60, expiresIn) * 1000).toISOString()
  const idPayload = tokenRes.id_token ? decodeJwtPayload(tokenRes.id_token) : null
  const email = asString(idPayload?.email) || null

  const db = serverSupabaseServiceRole(event) as any
  await setSystemConfigValues(db, [
    { key: 'gcal_oauth_refresh_token', value: refreshToken },
    { key: 'gcal_oauth_access_token', value: accessToken || null },
    { key: 'gcal_oauth_access_token_expires_at', value: expiresAtIso },
    { key: 'gcal_oauth_connected_email', value: email ?? '' },
    { key: 'gcal_oauth_state', value: null },
    { key: 'gcal_oauth_state_expires_at', value: null }
  ])
  await refreshServerConfig()

  return {
    email
  }
}

async function resolveGoogleAccessTokenForSync(event: H3Event, settings: GoogleCalendarSyncSettings) {
  const config = await getServerConfigMap(event, [
    'gcal_oauth_refresh_token',
    'gcal_oauth_access_token',
    'gcal_oauth_access_token_expires_at'
  ])
  const refreshToken = asString(config.gcal_oauth_refresh_token)
  const cachedAccessToken = asString(config.gcal_oauth_access_token)
  const cachedExpiry = asString(config.gcal_oauth_access_token_expires_at)
  const cachedExpiryMs = cachedExpiry ? Date.parse(cachedExpiry) : Number.NaN
  const bufferMs = 60_000

  if (settings.oauthClientId && refreshToken) {
    if (cachedAccessToken && !Number.isNaN(cachedExpiryMs) && cachedExpiryMs > Date.now() + bufferMs) {
      return cachedAccessToken
    }

    const clientSecretRaw = await getKey(event, settings.oauthClientSecretName || 'GOOGLE_OAUTH_CLIENT_SECRET')
    const clientSecret = asString(clientSecretRaw)
    if (!clientSecret) {
      throw new Error('Google OAuth client secret is missing in secrets store.')
    }

    const refreshed = await refreshGoogleOauthAccessToken(settings.oauthClientId, clientSecret, refreshToken)
    const nextAccessToken = asString(refreshed.access_token)
    if (!nextAccessToken) throw new Error('Google OAuth refresh did not return access_token')
    const nextExpiresIn = Number(refreshed.expires_in ?? 3600)
    const nextExpiry = new Date(Date.now() + Math.max(60, nextExpiresIn) * 1000).toISOString()
    const nextRefreshToken = asString(refreshed.refresh_token) || refreshToken

    const db = serverSupabaseServiceRole(event) as any
    await setSystemConfigValues(db, [
      { key: 'gcal_oauth_access_token', value: nextAccessToken },
      { key: 'gcal_oauth_access_token_expires_at', value: nextExpiry },
      { key: 'gcal_oauth_refresh_token', value: nextRefreshToken }
    ])
    await refreshServerConfig()
    return nextAccessToken
  }

  const serviceSecretRaw = await getKey(event, settings.serviceAccountSecretName)
  const serviceAccount = normalizeServiceAccount(serviceSecretRaw)
  return await exchangeGoogleAccessToken(serviceAccount)
}

export async function listGoogleCalendarsForConnectedAccount(event: H3Event): Promise<GoogleCalendarListEntry[]> {
  const settings = await getGoogleCalendarSyncSettings(event)
  if (!settings.oauthConnected || !settings.oauthClientId) return []
  const accessToken = await resolveGoogleAccessTokenForSync(event, settings)
  return await fetchGoogleCalendarList(accessToken)
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
      pushedRows: 0,
      deletedManagedRows: 0,
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
          pushedRows: 0,
          deletedManagedRows: 0,
          windowStart: null,
          windowEnd: null,
          syncedAt,
          dryRun
        }
      }
    }
  }

  const accessToken = await resolveGoogleAccessTokenForSync(event, settings)

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

  const managedGoogleEvents = new Map<string, GoogleCalendarEvent>()
  for (const entry of googleEvents) {
    const privateMeta = entry.extendedProperties?.private ?? {}
    const sourceKey = asString(privateMeta.fostudio_source_key)
    if (!sourceKey) continue
    managedGoogleEvents.set(sourceKey, entry)
  }

  let pushedRows = 0
  let deletedManagedRows = 0
  const db = serverSupabaseServiceRole(event) as any

  if (!dryRun && settings.pushEnabled) {
    const localBusyWindows = await collectLocalBusyWindows(db, windowStartIso, windowEndIso)
    const sourceKeys = new Set(localBusyWindows.map(item => item.sourceKey))

    for (const localItem of localBusyWindows) {
      const payload = {
        summary: localItem.summary,
        description: localItem.description,
        transparency: 'opaque',
        start: { dateTime: localItem.startTime },
        end: { dateTime: localItem.endTime },
        extendedProperties: {
          private: {
            fostudio_managed: 'true',
            fostudio_source_key: localItem.sourceKey
          }
        }
      }

      const existing = managedGoogleEvents.get(localItem.sourceKey)
      if (existing?.id) {
        try {
          await patchGoogleCalendarEvent(accessToken, settings.calendarId, existing.id, payload)
        } catch (error) {
          // Event disappeared or no longer accessible; recreate it.
          if (!isGoogleNotFoundError(error)) throw error
          await insertGoogleCalendarEvent(accessToken, settings.calendarId, payload)
        }
      } else {
        await insertGoogleCalendarEvent(accessToken, settings.calendarId, payload)
      }
      pushedRows += 1
    }

    for (const [sourceKey, eventItem] of managedGoogleEvents) {
      if (sourceKeys.has(sourceKey)) continue
      if (!eventItem.id) continue
      await deleteGoogleCalendarEvent(accessToken, settings.calendarId, eventItem.id)
      deletedManagedRows += 1
    }
  }

  const rows = googleEvents
    .map((entry) => {
      const privateMeta = entry.extendedProperties?.private ?? {}
      if (asString(privateMeta.fostudio_managed) === 'true') return null
      const externalEventId = asString(entry.id)
      const startIso = normalizeEventTime(entry.start, false)
      const endIso = normalizeEventTime(entry.end, true)
      if (!externalEventId || !startIso || !endIso) return null
      if (Date.parse(endIso) <= Date.parse(startIso)) return null
      if (asString(entry.transparency, 'opaque').toLowerCase() === 'transparent') return null
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
      pushEnabled: settings.pushEnabled,
      fetchedEvents: googleEvents.length,
      upsertedRows: rows.length,
      deactivatedRows,
      pushedRows,
      deletedManagedRows,
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
    pushedRows,
    deletedManagedRows,
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

export async function maybeForceSyncGoogleCalendar(event: H3Event, reason = 'calendar_mutation') {
  const settings = await getGoogleCalendarSyncSettings(event)
  if (!settings.enabled || !settings.pushEnabled) return null
  if (inFlightForcedSync) return inFlightForcedSync

  const waitForAutoSync = inFlightAutoSync
    ? inFlightAutoSync.catch(() => null)
    : Promise.resolve(null)

  inFlightForcedSync = waitForAutoSync
    .then(() => syncGoogleCalendarToExternalBlocks(event, {
      force: true,
      dryRun: false,
      reason
    }))
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
      inFlightForcedSync = null
    })

  return inFlightForcedSync
}
