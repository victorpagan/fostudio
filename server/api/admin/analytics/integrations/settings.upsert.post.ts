import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'

const bodySchema = z.object({
  syncEnabled: z.coerce.boolean().default(false),
  lookbackDays: z.coerce.number().int().min(1).max(365).default(30),
  google: z.object({
    enabled: z.coerce.boolean().default(false),
    customerId: z.string().max(80).optional().default(''),
    loginCustomerId: z.string().max(80).optional().default(''),
    apiVersion: z.string().max(20).optional().default('v19'),
    developerTokenSecretName: z.string().min(1).max(180).optional().default('GOOGLE_ADS_DEVELOPER_TOKEN'),
    clientIdSecretName: z.string().min(1).max(180).optional().default('GOOGLE_ADS_CLIENT_ID'),
    clientSecretSecretName: z.string().min(1).max(180).optional().default('GOOGLE_ADS_CLIENT_SECRET'),
    refreshTokenSecretName: z.string().min(1).max(180).optional().default('GOOGLE_ADS_REFRESH_TOKEN')
  }),
  meta: z.object({
    enabled: z.coerce.boolean().default(false),
    adAccountId: z.string().max(80).optional().default(''),
    apiVersion: z.string().max(20).optional().default('v25.0'),
    accessTokenSecretName: z.string().min(1).max(180).optional().default('META_MARKETING_ACCESS_TOKEN'),
    conversionActionTypes: z.array(z.string().trim().min(1).max(160)).max(60).optional().default([])
  })
})

function normalizeGoogleId(value: string) {
  return value.replaceAll('-', '').trim()
}

function normalizeMetaAccountId(value: string) {
  return value.replace(/^act_/i, '').trim()
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse((await readBody(event).catch(() => ({}))) ?? {})

  const rows = [
    { key: 'analytics_ads_sync_enabled', value: body.syncEnabled },
    { key: 'analytics_ads_lookback_days', value: body.lookbackDays },
    { key: 'analytics_ads_google_enabled', value: body.google.enabled },
    { key: 'analytics_ads_google_customer_id', value: normalizeGoogleId(body.google.customerId) },
    { key: 'analytics_ads_google_login_customer_id', value: normalizeGoogleId(body.google.loginCustomerId) },
    { key: 'analytics_ads_google_api_version', value: body.google.apiVersion.trim() || 'v19' },
    { key: 'analytics_ads_google_developer_token_secret_name', value: body.google.developerTokenSecretName.trim() || 'GOOGLE_ADS_DEVELOPER_TOKEN' },
    { key: 'analytics_ads_google_client_id_secret_name', value: body.google.clientIdSecretName.trim() || 'GOOGLE_ADS_CLIENT_ID' },
    { key: 'analytics_ads_google_client_secret_secret_name', value: body.google.clientSecretSecretName.trim() || 'GOOGLE_ADS_CLIENT_SECRET' },
    { key: 'analytics_ads_google_refresh_token_secret_name', value: body.google.refreshTokenSecretName.trim() || 'GOOGLE_ADS_REFRESH_TOKEN' },
    { key: 'analytics_ads_meta_enabled', value: body.meta.enabled },
    { key: 'analytics_ads_meta_ad_account_id', value: normalizeMetaAccountId(body.meta.adAccountId) },
    { key: 'analytics_ads_meta_api_version', value: body.meta.apiVersion.trim() || 'v25.0' },
    { key: 'analytics_ads_meta_access_token_secret_name', value: body.meta.accessTokenSecretName.trim() || 'META_MARKETING_ACCESS_TOKEN' },
    {
      key: 'analytics_ads_meta_conversion_action_types',
      value: [...new Set(
        body.meta.conversionActionTypes
          .map(item => item.trim().toLowerCase())
          .filter(Boolean)
      )]
    }
  ]

  const { error } = await supabase
    .from('system_config')
    .upsert(rows, { onConflict: 'key' })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  await refreshServerConfig()

  return { ok: true }
})
