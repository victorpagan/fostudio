import { DateTime } from 'luxon'
import { createSupabaseClient } from './lib/supabase'

type SystemConfigRow = {
  key: string
  value: unknown
}

type GoogleSettings = {
  enabled: boolean
  customerId: string
  loginCustomerId: string
  apiVersion: string
  developerTokenSecretName: string
  clientIdSecretName: string
  clientSecretSecretName: string
  refreshTokenSecretName: string
}

type MetaSettings = {
  enabled: boolean
  adAccountId: string
  apiVersion: string
  accessTokenSecretName: string
  conversionActionTypes: string[]
}

type AdsSyncSettings = {
  syncEnabled: boolean
  lookbackDays: number
  google: GoogleSettings
  meta: MetaSettings
}

type ProviderResult = {
  platform: 'google' | 'meta'
  enabled: boolean
  ok: boolean
  skippedReason: string | null
  error: string | null
  fetchedRows: number
  upsertedRows: number
}

type SyncStatus = {
  ok: boolean
  sync_enabled: boolean
  lookback_days: number
  dry_run: boolean
  window_start: string
  window_end: string
  providers: ProviderResult[]
  totals: {
    fetched_rows: number
    upserted_rows: number
  }
}

type SyncSummary = {
  ok: boolean
  generatedAt: string
  syncEnabled: boolean
  lookbackDays: number
  dryRun: boolean
  windowStart: string
  windowEnd: string
  providers: ProviderResult[]
  totals: {
    fetchedRows: number
    upsertedRows: number
  }
}

type AdUpsertRow = {
  date: string
  platform: 'google' | 'meta'
  campaign: string
  spend: number
  clicks: number
  impressions: number
  conversions: number
  source: string
  metadata: Record<string, unknown>
  synced_at: string
}

type GoogleRawResult = {
  campaign?: {
    id?: string
    name?: string
  }
  segments?: {
    date?: string
  }
  metrics?: {
    costMicros?: string | number
    cost_micros?: string | number
    clicks?: string | number
    impressions?: string | number
    conversions?: string | number
  }
}

type MetaRawAction = {
  action_type?: string
  value?: string | number
}

type MetaRawRow = {
  date_start?: string
  campaign_name?: string
  spend?: string | number
  clicks?: string | number
  impressions?: string | number
  actions?: MetaRawAction[]
}

type MetaApiErrorPayload = {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

const SETTINGS_KEYS = [
  'analytics_ads_sync_enabled',
  'analytics_ads_lookback_days',
  'analytics_ads_google_enabled',
  'analytics_ads_google_customer_id',
  'analytics_ads_google_login_customer_id',
  'analytics_ads_google_api_version',
  'analytics_ads_google_developer_token_secret_name',
  'analytics_ads_google_client_id_secret_name',
  'analytics_ads_google_client_secret_secret_name',
  'analytics_ads_google_refresh_token_secret_name',
  'analytics_ads_meta_enabled',
  'analytics_ads_meta_ad_account_id',
  'analytics_ads_meta_api_version',
  'analytics_ads_meta_access_token_secret_name',
  'analytics_ads_meta_conversion_action_types',
  'analytics_ads_last_sync_at',
  'analytics_ads_last_sync_status'
] as const

const DEFAULT_META_CONVERSION_ACTION_TYPES = [
  'lead',
  'onsite_conversion.lead_grouped',
  'purchase',
  'onsite_conversion.purchase',
  'offsite_conversion.purchase',
  'offsite_conversion.fb_pixel_purchase'
]

const GOOGLE_DEFAULT_API_VERSION = 'v23'
const GOOGLE_API_FALLBACK_VERSIONS = ['v23', 'v22', 'v21', 'v20'] as const

function hasFlag(name: string) {
  return process.argv.includes(name)
}

function readFlagValue(name: string) {
  const prefix = `${name}=`
  const entry = process.argv.find(arg => arg.startsWith(prefix))
  if (!entry) return null
  return entry.slice(prefix.length)
}

function asBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return fallback
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function asTrimmedString(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function asStringArray(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const normalized = value
      .map(item => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter(Boolean)
    return normalized.length > 0 ? [...new Set(normalized)] : fallback
  }

  if (typeof value === 'string') {
    const normalized = value
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)
    return normalized.length > 0 ? [...new Set(normalized)] : fallback
  }

  return fallback
}

function firstDefined(...values: Array<unknown>) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeGoogleCustomerId(value: string) {
  return value.replaceAll('-', '').trim()
}

function normalizeMetaAdAccountId(value: string) {
  return value.replace(/^act_/i, '').trim()
}

function normalizeGoogleApiVersion(value: string, fallback = GOOGLE_DEFAULT_API_VERSION) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return fallback
  const match = raw.match(/v?(\d{1,3})(?:\.\d+)?/)
  const major = Number(match?.[1] ?? NaN)
  if (!Number.isFinite(major) || major < 1) return fallback
  return `v${major}`
}

function normalizeMetaApiVersion(value: string, fallback = 'v25.0') {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return fallback
  const match = raw.match(/v?(\d{1,3})(?:\.(\d+))?/)
  const major = Number(match?.[1] ?? NaN)
  if (!Number.isFinite(major) || major < 1) return fallback
  const minor = Number(match?.[2] ?? 0)
  if (!Number.isFinite(minor) || minor < 0) return `v${major}.0`
  return `v${major}.${Math.floor(minor)}`
}

function safeCampaignName(value: unknown) {
  const normalized = asTrimmedString(value, 'unknown-campaign')
  return normalized || 'unknown-campaign'
}

function parseGoogleErrorMessage(rawText: string) {
  let parsedMessage: string | null = null
  let authorizationError: string | null = null

  try {
    const parsed = JSON.parse(rawText) as unknown
    const node = Array.isArray(parsed) ? parsed[0] : parsed
    const root = (node && typeof node === 'object') ? (node as { error?: unknown }).error : null
    const errorObj = (root && typeof root === 'object') ? root as { message?: unknown, details?: unknown[] } : null
    const topMessage = asTrimmedString(errorObj?.message)
    if (topMessage) parsedMessage = topMessage

    if (Array.isArray(errorObj?.details)) {
      for (const detail of errorObj.details) {
        if (!detail || typeof detail !== 'object') continue
        const errors = Array.isArray((detail as { errors?: unknown[] }).errors)
          ? (detail as { errors: Array<{ errorCode?: { authorizationError?: string }, message?: string }> }).errors
          : []
        for (const item of errors) {
          const code = asTrimmedString(item?.errorCode?.authorizationError)
          const message = asTrimmedString(item?.message)
          if (code) authorizationError = code
          if (message) parsedMessage = message
        }
      }
    }
  } catch {
    // keep defaults
  }

  const fallback = rawText.slice(0, 900)
  return {
    message: parsedMessage || fallback,
    authorizationError
  }
}

function mapConfigRows(rows: SystemConfigRow[]) {
  return new Map(rows.map(row => [row.key, row.value] as const))
}

function readSettings(configMap: Map<string, unknown>): AdsSyncSettings {
  const lookbackFromFlag = readFlagValue('--lookback-days')

  return {
    syncEnabled: asBoolean(
      firstDefined(
        configMap.get('analytics_ads_sync_enabled'),
        process.env.ANALYTICS_ADS_SYNC_ENABLED
      ),
      false
    ),
    lookbackDays: clampInteger(
      firstDefined(
        lookbackFromFlag,
        configMap.get('analytics_ads_lookback_days'),
        process.env.ANALYTICS_ADS_LOOKBACK_DAYS
      ),
      30,
      1,
      365
    ),
    google: {
      enabled: asBoolean(
        firstDefined(
          configMap.get('analytics_ads_google_enabled'),
          process.env.ANALYTICS_ADS_GOOGLE_ENABLED
        ),
        false
      ),
      customerId: normalizeGoogleCustomerId(asTrimmedString(firstDefined(
        configMap.get('analytics_ads_google_customer_id'),
        process.env.ANALYTICS_ADS_GOOGLE_CUSTOMER_ID,
        process.env.GOOGLE_ADS_CUSTOMER_ID
      ))),
      loginCustomerId: normalizeGoogleCustomerId(asTrimmedString(firstDefined(
        configMap.get('analytics_ads_google_login_customer_id'),
        process.env.ANALYTICS_ADS_GOOGLE_LOGIN_CUSTOMER_ID,
        process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
      ))),
      apiVersion: normalizeGoogleApiVersion(
        asTrimmedString(firstDefined(
          configMap.get('analytics_ads_google_api_version'),
          process.env.ANALYTICS_ADS_GOOGLE_API_VERSION
        )),
        GOOGLE_DEFAULT_API_VERSION
      ),
      developerTokenSecretName: asTrimmedString(
        firstDefined(
          configMap.get('analytics_ads_google_developer_token_secret_name'),
          process.env.ANALYTICS_ADS_GOOGLE_DEVELOPER_TOKEN_SECRET_NAME
        ),
        'GOOGLE_ADS_DEVELOPER_TOKEN'
      ),
      clientIdSecretName: asTrimmedString(
        firstDefined(
          configMap.get('analytics_ads_google_client_id_secret_name'),
          process.env.ANALYTICS_ADS_GOOGLE_CLIENT_ID_SECRET_NAME
        ),
        'GOOGLE_ADS_CLIENT_ID'
      ),
      clientSecretSecretName: asTrimmedString(
        firstDefined(
          configMap.get('analytics_ads_google_client_secret_secret_name'),
          process.env.ANALYTICS_ADS_GOOGLE_CLIENT_SECRET_SECRET_NAME
        ),
        'GOOGLE_ADS_CLIENT_SECRET'
      ),
      refreshTokenSecretName: asTrimmedString(
        firstDefined(
          configMap.get('analytics_ads_google_refresh_token_secret_name'),
          process.env.ANALYTICS_ADS_GOOGLE_REFRESH_TOKEN_SECRET_NAME
        ),
        'GOOGLE_ADS_REFRESH_TOKEN'
      )
    },
    meta: {
      enabled: asBoolean(
        firstDefined(
          configMap.get('analytics_ads_meta_enabled'),
          process.env.ANALYTICS_ADS_META_ENABLED
        ),
        false
      ),
      adAccountId: normalizeMetaAdAccountId(asTrimmedString(firstDefined(
        configMap.get('analytics_ads_meta_ad_account_id'),
        process.env.ANALYTICS_ADS_META_AD_ACCOUNT_ID,
        process.env.META_AD_ACCOUNT_ID
      ))),
      apiVersion: normalizeMetaApiVersion(
        asTrimmedString(firstDefined(
          configMap.get('analytics_ads_meta_api_version'),
          process.env.ANALYTICS_ADS_META_API_VERSION
        )),
        'v25.0'
      ),
      accessTokenSecretName: asTrimmedString(
        firstDefined(
          configMap.get('analytics_ads_meta_access_token_secret_name'),
          process.env.ANALYTICS_ADS_META_ACCESS_TOKEN_SECRET_NAME
        ),
        'META_MARKETING_ACCESS_TOKEN'
      ),
      conversionActionTypes: asStringArray(
        firstDefined(
          configMap.get('analytics_ads_meta_conversion_action_types'),
          process.env.ANALYTICS_ADS_META_CONVERSION_ACTION_TYPES
        ),
        DEFAULT_META_CONVERSION_ACTION_TYPES
      )
    }
  }
}

async function getSecretValue(supabase: NonNullable<ReturnType<typeof createSupabaseClient>>, secretName: string) {
  const name = secretName.trim()
  if (!name) return null

  const { data, error } = await supabase.rpc('get_secret', {
    secret_name: name
  })

  if (error) {
    throw new Error(`Could not read secret ${name}: ${error.message}`)
  }

  if (typeof data === 'string') {
    const value = data.trim()
    return value || null
  }

  if (data === null || data === undefined) return null
  const value = String(data).trim()
  return value || null
}

async function fetchGoogleAccessToken(input: {
  clientId: string
  clientSecret: string
  refreshToken: string
}) {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: 'refresh_token'
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google token exchange failed (${response.status}): ${text.slice(0, 500)}`)
  }

  const payload = await response.json() as { access_token?: string }
  const token = asTrimmedString(payload.access_token)
  if (!token) throw new Error('Google token exchange returned an empty access token.')
  return token
}

function readGoogleMetric(metrics: GoogleRawResult['metrics'] | undefined, camel: keyof NonNullable<GoogleRawResult['metrics']>, snake: keyof NonNullable<GoogleRawResult['metrics']>) {
  if (!metrics) return 0
  return toNumber(metrics[camel] ?? metrics[snake], 0)
}

async function fetchGoogleAdsRows(input: {
  customerId: string
  loginCustomerId: string
  developerToken: string
  accessToken: string
  apiVersion: string
  startDate: string
  endDate: string
}): Promise<AdUpsertRow[]> {
  const requestedVersion = normalizeGoogleApiVersion(input.apiVersion || GOOGLE_DEFAULT_API_VERSION, GOOGLE_DEFAULT_API_VERSION)
  const candidateVersions = [...new Set<string>([
    requestedVersion,
    ...GOOGLE_API_FALLBACK_VERSIONS
  ])]

  const query = [
    'SELECT',
    '  campaign.id,',
    '  campaign.name,',
    '  segments.date,',
    '  metrics.cost_micros,',
    '  metrics.clicks,',
    '  metrics.impressions,',
    '  metrics.conversions',
    'FROM campaign',
    `WHERE segments.date BETWEEN '${input.startDate}' AND '${input.endDate}'`,
    '  AND campaign.status != \'REMOVED\''
  ].join(' ')

  const headers: Record<string, string> = {
    'authorization': `Bearer ${input.accessToken}`,
    'developer-token': input.developerToken,
    'content-type': 'application/json'
  }

  if (input.loginCustomerId) {
    headers['login-customer-id'] = input.loginCustomerId
  }

  let lastError: Error | null = null
  const rows: AdUpsertRow[] = []

  for (const version of candidateVersions) {
    const endpoint = `https://googleads.googleapis.com/${version}/customers/${input.customerId}/googleAds:searchStream`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query })
    })

    if (!response.ok) {
      const text = await response.text()
      const parsed = parseGoogleErrorMessage(text)
      const contentType = String(response.headers.get('content-type') ?? '').toLowerCase()

      const detail = parsed.authorizationError
        ? `${parsed.message} (authorizationError=${parsed.authorizationError})`
        : parsed.message

      const isLikelyVersionIssue = response.status === 404
        && (contentType.includes('text/html') || detail.toLowerCase().includes('method not found'))
      lastError = new Error(`Google Ads query failed (${response.status}) on ${version}: ${detail}`)
      if (isLikelyVersionIssue) {
        continue
      }
      throw lastError
    }

    const payload = await response.json()
    const chunks = Array.isArray(payload) ? payload : [payload]

    for (const chunk of chunks) {
      const results = Array.isArray((chunk as { results?: unknown[] }).results)
        ? (chunk as { results: GoogleRawResult[] }).results
        : []

      for (const result of results) {
        const date = asTrimmedString(result.segments?.date)
        if (!date) continue

        const costMicros = readGoogleMetric(result.metrics, 'costMicros', 'cost_micros')
        const spend = Math.max(0, costMicros / 1_000_000)
        const clicks = Math.max(0, Math.round(readGoogleMetric(result.metrics, 'clicks', 'clicks')))
        const impressions = Math.max(0, Math.round(readGoogleMetric(result.metrics, 'impressions', 'impressions')))
        const conversions = Math.max(0, readGoogleMetric(result.metrics, 'conversions', 'conversions'))

        rows.push({
          date,
          platform: 'google',
          campaign: safeCampaignName(result.campaign?.name),
          spend,
          clicks,
          impressions,
          conversions,
          source: 'google_api',
          metadata: {
            campaign_id: asTrimmedString(result.campaign?.id) || null
          },
          synced_at: new Date().toISOString()
        })
      }
    }

    return rows
  }

  throw (lastError ?? new Error(`Google Ads query failed across versions: ${candidateVersions.join(', ')}`))
}

function parseMetaConversions(actions: MetaRawAction[] | undefined, allowList: string[]) {
  const allowed = new Set(allowList.map(item => item.toLowerCase().trim()).filter(Boolean))
  if (!actions || actions.length === 0) return 0
  if (allowed.size === 0) return 0

  let total = 0
  for (const action of actions) {
    const actionType = asTrimmedString(action.action_type).toLowerCase()
    if (!actionType || !allowed.has(actionType)) continue
    total += Math.max(0, toNumber(action.value, 0))
  }
  return total
}

async function fetchMetaAdsRows(input: {
  adAccountId: string
  accessToken: string
  apiVersion: string
  startDate: string
  endDate: string
  conversionActionTypes: string[]
}): Promise<AdUpsertRow[]> {
  const version = input.apiVersion || 'v25.0'
  const accountId = normalizeMetaAdAccountId(input.adAccountId)
  const baseUrl = new URL(`https://graph.facebook.com/${version}/act_${accountId}/insights`)
  baseUrl.searchParams.set('level', 'campaign')
  baseUrl.searchParams.set('time_increment', '1')
  baseUrl.searchParams.set('fields', 'date_start,campaign_name,spend,clicks,impressions,actions')
  baseUrl.searchParams.set('limit', '5000')
  baseUrl.searchParams.set('time_range[since]', input.startDate)
  baseUrl.searchParams.set('time_range[until]', input.endDate)
  baseUrl.searchParams.set('access_token', input.accessToken)

  const rows: AdUpsertRow[] = []
  let nextUrl: string | null = baseUrl.toString()
  let page = 0
  const maxPages = 40

  while (nextUrl && page < maxPages) {
    page += 1
    const response = await fetch(nextUrl)

    if (!response.ok) {
      const text = await response.text()
      let detail = text.slice(0, 900)
      try {
        const parsed = JSON.parse(text) as MetaApiErrorPayload
        const message = asTrimmedString(parsed.error?.message)
        const code = parsed.error?.code
        const subcode = parsed.error?.error_subcode
        if (message && code === 190 && subcode === 463) {
          throw new Error(`Meta access token expired (code 190/463). ${message}`)
        }
        if (message) {
          detail = code
            ? `${message} (code ${code}${subcode ? `/${subcode}` : ''})`
            : message
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.message.toLowerCase().includes('token expired')) {
          throw error
        }
      }
      throw new Error(`Meta insights query failed (${response.status}): ${detail}`)
    }

    const payload = await response.json() as {
      data?: MetaRawRow[]
      paging?: { next?: string }
      error?: { message?: string }
    }

    if (payload.error?.message) {
      throw new Error(`Meta insights error: ${payload.error.message}`)
    }

    const dataRows = Array.isArray(payload.data) ? payload.data : []
    for (const row of dataRows) {
      const date = asTrimmedString(row.date_start)
      if (!date) continue

      rows.push({
        date,
        platform: 'meta',
        campaign: safeCampaignName(row.campaign_name),
        spend: Math.max(0, toNumber(row.spend, 0)),
        clicks: Math.max(0, Math.round(toNumber(row.clicks, 0))),
        impressions: Math.max(0, Math.round(toNumber(row.impressions, 0))),
        conversions: parseMetaConversions(row.actions, input.conversionActionTypes),
        source: 'meta_api',
        metadata: {
          conversion_action_types: input.conversionActionTypes
        },
        synced_at: new Date().toISOString()
      })
    }

    nextUrl = payload.paging?.next ?? null
  }

  return rows
}

async function upsertAdsRows(
  supabase: NonNullable<ReturnType<typeof createSupabaseClient>>,
  rows: AdUpsertRow[],
  dryRun: boolean
) {
  if (rows.length === 0) return 0
  if (dryRun) return rows.length

  const payload = rows.map(row => ({
    date: row.date,
    platform: row.platform,
    campaign: row.campaign,
    spend: Number(row.spend.toFixed(2)),
    clicks: row.clicks,
    impressions: row.impressions,
    conversions: Number(row.conversions.toFixed(2)),
    source: row.source,
    metadata: row.metadata,
    synced_at: row.synced_at
  }))

  const { error, data } = await supabase
    .from('analytics_ad_daily')
    .upsert(payload, {
      onConflict: 'date,platform,campaign,source'
    })
    .select('id')

  if (error) {
    throw new Error(`analytics_ad_daily upsert failed: ${error.message}`)
  }

  return Array.isArray(data) ? data.length : payload.length
}

async function upsertSyncStatus(
  supabase: NonNullable<ReturnType<typeof createSupabaseClient>>,
  generatedAt: string,
  status: SyncStatus
) {
  const rows = [
    { key: 'analytics_ads_last_sync_at', value: generatedAt },
    { key: 'analytics_ads_last_sync_status', value: status }
  ]

  const { error } = await supabase
    .from('system_config')
    .upsert(rows, { onConflict: 'key' })

  if (error) {
    throw new Error(`Could not persist analytics ads sync status: ${error.message}`)
  }
}

function buildSkippedResult(platform: 'google' | 'meta', enabled: boolean, reason: string): ProviderResult {
  return {
    platform,
    enabled,
    ok: true,
    skippedReason: reason,
    error: null,
    fetchedRows: 0,
    upsertedRows: 0
  }
}

async function syncGoogleProvider(input: {
  supabase: NonNullable<ReturnType<typeof createSupabaseClient>>
  settings: AdsSyncSettings
  dryRun: boolean
  startDate: string
  endDate: string
}): Promise<ProviderResult> {
  if (!input.settings.google.enabled) {
    return buildSkippedResult('google', false, 'Google sync is disabled.')
  }

  if (!input.settings.google.customerId) {
    return buildSkippedResult('google', true, 'Google customer ID is missing.')
  }

  try {
    const [developerToken, clientId, clientSecret, refreshToken] = await Promise.all([
      getSecretValue(input.supabase, input.settings.google.developerTokenSecretName),
      getSecretValue(input.supabase, input.settings.google.clientIdSecretName),
      getSecretValue(input.supabase, input.settings.google.clientSecretSecretName),
      getSecretValue(input.supabase, input.settings.google.refreshTokenSecretName)
    ])

    if (!developerToken || !clientId || !clientSecret || !refreshToken) {
      return {
        platform: 'google',
        enabled: true,
        ok: false,
        skippedReason: null,
        error: 'Google ads secrets are incomplete (developer token/client ID/client secret/refresh token).',
        fetchedRows: 0,
        upsertedRows: 0
      }
    }

    const accessToken = await fetchGoogleAccessToken({
      clientId,
      clientSecret,
      refreshToken
    })

    const rows = await fetchGoogleAdsRows({
      customerId: input.settings.google.customerId,
      loginCustomerId: input.settings.google.loginCustomerId,
      developerToken,
      accessToken,
      apiVersion: input.settings.google.apiVersion,
      startDate: input.startDate,
      endDate: input.endDate
    })

    const upsertedRows = await upsertAdsRows(input.supabase, rows, input.dryRun)

    return {
      platform: 'google',
      enabled: true,
      ok: true,
      skippedReason: null,
      error: null,
      fetchedRows: rows.length,
      upsertedRows
    }
  } catch (error: unknown) {
    return {
      platform: 'google',
      enabled: true,
      ok: false,
      skippedReason: null,
      error: error instanceof Error ? error.message : 'Google sync failed',
      fetchedRows: 0,
      upsertedRows: 0
    }
  }
}

async function syncMetaProvider(input: {
  supabase: NonNullable<ReturnType<typeof createSupabaseClient>>
  settings: AdsSyncSettings
  dryRun: boolean
  startDate: string
  endDate: string
}): Promise<ProviderResult> {
  if (!input.settings.meta.enabled) {
    return buildSkippedResult('meta', false, 'Meta sync is disabled.')
  }

  if (!input.settings.meta.adAccountId) {
    return buildSkippedResult('meta', true, 'Meta ad account ID is missing.')
  }

  try {
    const accessToken = await getSecretValue(input.supabase, input.settings.meta.accessTokenSecretName)

    if (!accessToken) {
      return {
        platform: 'meta',
        enabled: true,
        ok: false,
        skippedReason: null,
        error: 'Meta access token secret is missing.',
        fetchedRows: 0,
        upsertedRows: 0
      }
    }

    const rows = await fetchMetaAdsRows({
      adAccountId: input.settings.meta.adAccountId,
      accessToken,
      apiVersion: input.settings.meta.apiVersion,
      startDate: input.startDate,
      endDate: input.endDate,
      conversionActionTypes: input.settings.meta.conversionActionTypes
    })

    const upsertedRows = await upsertAdsRows(input.supabase, rows, input.dryRun)

    return {
      platform: 'meta',
      enabled: true,
      ok: true,
      skippedReason: null,
      error: null,
      fetchedRows: rows.length,
      upsertedRows
    }
  } catch (error: unknown) {
    return {
      platform: 'meta',
      enabled: true,
      ok: false,
      skippedReason: null,
      error: error instanceof Error ? error.message : 'Meta sync failed',
      fetchedRows: 0,
      upsertedRows: 0
    }
  }
}

async function run() {
  const jsonMode = hasFlag('--json')
  const dryRun = hasFlag('--dry-run')
  const failOnError = process.env.ANALYTICS_FAIL_ON_ADS_SYNC_ERROR === '1'

  const supabase = createSupabaseClient()
  if (!supabase) {
    const summary: SyncSummary = {
      ok: false,
      generatedAt: new Date().toISOString(),
      syncEnabled: false,
      lookbackDays: 0,
      dryRun,
      windowStart: '',
      windowEnd: '',
      providers: [],
      totals: {
        fetchedRows: 0,
        upsertedRows: 0
      }
    }

    if (jsonMode) {
      process.stdout.write(`${JSON.stringify(summary)}\n`)
    } else {
      console.log('[analytics] ads sync skipped: Supabase credentials unavailable.')
    }

    if (failOnError) process.exitCode = 1
    return
  }

  const { data, error } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', [...SETTINGS_KEYS])

  if (error) {
    throw new Error(`Could not load analytics ads settings: ${error.message}`)
  }

  const configMap = mapConfigRows((data ?? []) as SystemConfigRow[])
  const settings = readSettings(configMap)
  const now = DateTime.now().setZone('America/Los_Angeles')
  const windowEnd = now.toISODate() ?? now.toFormat('yyyy-MM-dd')
  const windowStart = now.minus({ days: settings.lookbackDays - 1 }).toISODate() ?? now.toFormat('yyyy-MM-dd')

  const providers: ProviderResult[] = []

  if (!settings.syncEnabled) {
    providers.push(
      buildSkippedResult('google', settings.google.enabled, 'Global ads sync is disabled.'),
      buildSkippedResult('meta', settings.meta.enabled, 'Global ads sync is disabled.')
    )
  } else {
    const [googleResult, metaResult] = await Promise.all([
      syncGoogleProvider({
        supabase,
        settings,
        dryRun,
        startDate: windowStart,
        endDate: windowEnd
      }),
      syncMetaProvider({
        supabase,
        settings,
        dryRun,
        startDate: windowStart,
        endDate: windowEnd
      })
    ])

    providers.push(googleResult, metaResult)
  }

  const totals = {
    fetchedRows: providers.reduce((sum, item) => sum + Math.max(0, item.fetchedRows), 0),
    upsertedRows: providers.reduce((sum, item) => sum + Math.max(0, item.upsertedRows), 0)
  }

  const enabledProviders = providers.filter(item => item.enabled)
  const ok = enabledProviders.every(item => item.ok)
  const generatedAt = new Date().toISOString()

  const status: SyncStatus = {
    ok,
    sync_enabled: settings.syncEnabled,
    lookback_days: settings.lookbackDays,
    dry_run: dryRun,
    window_start: windowStart,
    window_end: windowEnd,
    providers,
    totals: {
      fetched_rows: totals.fetchedRows,
      upserted_rows: totals.upsertedRows
    }
  }

  await upsertSyncStatus(supabase, generatedAt, status)

  const summary: SyncSummary = {
    ok,
    generatedAt,
    syncEnabled: settings.syncEnabled,
    lookbackDays: settings.lookbackDays,
    dryRun,
    windowStart,
    windowEnd,
    providers,
    totals
  }

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(summary)}\n`)
  } else {
    console.log('[analytics] ads sync complete', summary)
  }

  if (!ok && failOnError) {
    process.exitCode = 1
  }
}

run().catch((error: unknown) => {
  const jsonMode = hasFlag('--json')
  const message = error instanceof Error ? error.message : String(error)
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: message
    })}\n`)
  } else {
    console.error('[analytics] ads sync failed', message)
  }
  process.exitCode = 1
})
