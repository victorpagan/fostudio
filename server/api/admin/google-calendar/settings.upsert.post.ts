import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { refreshServerConfig } from '~~/server/utils/config/secret'

const bodySchema = z.object({
  enabled: z.boolean(),
  calendarId: z.string().max(300).optional().default(''),
  serviceAccountSecretName: z.string().min(1).max(160).optional().default('GOOGLE_SERVICE_ACCOUNT_JSON'),
  lookbackDays: z.number().int().min(0).max(365).optional().default(14),
  lookaheadDays: z.number().int().min(1).max(730).optional().default(180),
  syncIntervalMinutes: z.number().int().min(1).max(1440).optional().default(5)
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const rows = [
    { key: 'gcal_sync_enabled', value: body.enabled },
    { key: 'gcal_calendar_id', value: body.calendarId.trim() },
    { key: 'gcal_service_account_secret_name', value: body.serviceAccountSecretName.trim() || 'GOOGLE_SERVICE_ACCOUNT_JSON' },
    { key: 'gcal_sync_lookback_days', value: body.lookbackDays },
    { key: 'gcal_sync_lookahead_days', value: body.lookaheadDays },
    { key: 'gcal_sync_interval_minutes', value: body.syncIntervalMinutes }
  ]

  const { error } = await supabase
    .from('system_config')
    .upsert(rows, { onConflict: 'key' })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  await refreshServerConfig()

  return { ok: true }
})
