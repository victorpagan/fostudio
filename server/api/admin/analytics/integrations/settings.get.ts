import { requireServerAdmin } from '~~/server/utils/auth'

type SystemConfigRow = {
  key: string
  value: unknown
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
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
    return normalized.length > 0 ? [...new Set(normalized)] : fallback
  }

  if (typeof value === 'string') {
    const normalized = value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
    return normalized.length > 0 ? [...new Set(normalized)] : fallback
  }

  return fallback
}

function mapConfigRows(rows: SystemConfigRow[]) {
  return new Map(rows.map(row => [row.key, row.value] as const))
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)

  const { data, error } = await supabase
    .from('system_config')
    .select('key,value')
    .in('key', [...SETTINGS_KEYS])

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const configMap = mapConfigRows((data ?? []) as SystemConfigRow[])

  return {
    settings: {
      syncEnabled: asBoolean(configMap.get('analytics_ads_sync_enabled'), false),
      lookbackDays: clampInteger(configMap.get('analytics_ads_lookback_days'), 30, 1, 365),
      google: {
        enabled: asBoolean(configMap.get('analytics_ads_google_enabled'), false),
        customerId: asTrimmedString(configMap.get('analytics_ads_google_customer_id')),
        loginCustomerId: asTrimmedString(configMap.get('analytics_ads_google_login_customer_id')),
        apiVersion: asTrimmedString(configMap.get('analytics_ads_google_api_version'), 'v19'),
        developerTokenSecretName: asTrimmedString(
          configMap.get('analytics_ads_google_developer_token_secret_name'),
          'GOOGLE_ADS_DEVELOPER_TOKEN'
        ),
        clientIdSecretName: asTrimmedString(
          configMap.get('analytics_ads_google_client_id_secret_name'),
          'GOOGLE_ADS_CLIENT_ID'
        ),
        clientSecretSecretName: asTrimmedString(
          configMap.get('analytics_ads_google_client_secret_secret_name'),
          'GOOGLE_ADS_CLIENT_SECRET'
        ),
        refreshTokenSecretName: asTrimmedString(
          configMap.get('analytics_ads_google_refresh_token_secret_name'),
          'GOOGLE_ADS_REFRESH_TOKEN'
        )
      },
      meta: {
        enabled: asBoolean(configMap.get('analytics_ads_meta_enabled'), false),
        adAccountId: asTrimmedString(configMap.get('analytics_ads_meta_ad_account_id')),
        apiVersion: asTrimmedString(configMap.get('analytics_ads_meta_api_version'), 'v25.0'),
        accessTokenSecretName: asTrimmedString(
          configMap.get('analytics_ads_meta_access_token_secret_name'),
          'META_MARKETING_ACCESS_TOKEN'
        ),
        conversionActionTypes: asStringArray(
          configMap.get('analytics_ads_meta_conversion_action_types'),
          DEFAULT_META_CONVERSION_ACTION_TYPES
        )
      },
      lastSyncAt: configMap.get('analytics_ads_last_sync_at') ?? null,
      lastSyncStatus: configMap.get('analytics_ads_last_sync_status') ?? null
    }
  }
})
