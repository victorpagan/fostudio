import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'

const bodySchema = z.object({
  enabled: z.coerce.boolean(),
  pushEnabled: z.coerce.boolean().optional().default(false),
  calendarId: z.string().max(300).optional().default(''),
  oauthClientId: z.string().max(300).optional().default(''),
  oauthClientSecretName: z.string().min(1).max(160).optional().default('GOOGLE_OAUTH_CLIENT_SECRET'),
  serviceAccountSecretName: z.string().min(1).max(160).optional().default('GOOGLE_SERVICE_ACCOUNT_JSON'),
  lookbackDays: z.coerce.number().int().min(0).max(365).optional().default(14),
  lookaheadDays: z.coerce.number().int().min(1).max(730).optional().default(180),
  syncIntervalMinutes: z.coerce.number().int().min(1).max(1440).optional().default(5)
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid Google Calendar settings payload: ${parsed.error.issues.map(i => i.message).join(', ')}`
    })
  }
  const body = parsed.data

  function normalizeDbError(message: string) {
    if (/<html|<!doctype html|cloudflare|bad gateway/i.test(message)) {
      return 'Database temporarily unavailable (Supabase 502). Please retry in a few seconds.'
    }
    return message
  }

  async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 400): Promise<T> {
    let lastErr: unknown = null
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn()
      } catch (error) {
        lastErr = error
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)))
        }
      }
    }
    throw lastErr
  }

  const rows = [
    { key: 'gcal_sync_enabled', value: body.enabled },
    { key: 'gcal_push_enabled', value: body.pushEnabled },
    { key: 'gcal_calendar_id', value: body.calendarId.trim() },
    { key: 'gcal_oauth_client_id', value: body.oauthClientId.trim() },
    { key: 'gcal_oauth_client_secret_name', value: body.oauthClientSecretName.trim() || 'GOOGLE_OAUTH_CLIENT_SECRET' },
    { key: 'gcal_service_account_secret_name', value: body.serviceAccountSecretName.trim() || 'GOOGLE_SERVICE_ACCOUNT_JSON' },
    { key: 'gcal_sync_lookback_days', value: body.lookbackDays },
    { key: 'gcal_sync_lookahead_days', value: body.lookaheadDays },
    { key: 'gcal_sync_interval_minutes', value: body.syncIntervalMinutes }
  ]

  await withRetry(async () => {
    for (const row of rows) {
      const { data: updatedRows, error: updateErr } = await supabase
        .from('system_config')
        .update({ value: row.value })
        .eq('key', row.key)
        .select('key')

      if (updateErr) {
        throw new Error(`Failed to update ${row.key}: ${normalizeDbError(updateErr.message)}`)
      }

      if ((updatedRows?.length ?? 0) > 0) continue

      const { error: insertErr } = await supabase
        .from('system_config')
        .insert(row)
      if (insertErr) {
        throw new Error(`Failed to insert ${row.key}: ${normalizeDbError(insertErr.message)}`)
      }
    }
  })

  await refreshServerConfig()

  return { ok: true }
})
