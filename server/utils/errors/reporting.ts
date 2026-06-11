import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getHeader, getRequestIP, getRequestURL, type H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'

type JsonRecord = Record<string, unknown>

export type ReportAppErrorInput = {
  sourceApp: string
  runtime?: string
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical' | 'warn'
  message: string
  publicMessage?: string | null
  stackTrace?: string | null
  fingerprint?: string | null
  route?: string | null
  method?: string | null
  statusCode?: number | string | null
  file?: string | null
  userId?: string | null
  metadata?: unknown
}

const SECRET_KEY_PATTERN = /authorization|api[-_]?key|bearer|card|cookie|cvv|nonce|pan|password|payment|secret|session|source[-_]?id|token/i
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isRecord = (value: unknown): value is JsonRecord => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const cleanString = (value: unknown, maxLength = 2000): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed
}

const normalizeSeverity = (value: ReportAppErrorInput['severity'] = 'error') => {
  if (value === 'warn') return 'warning'
  if (value === 'debug' || value === 'info' || value === 'warning' || value === 'error' || value === 'critical') return value
  return 'error'
}

const cleanInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed)) return parsed
  }
  return null
}

const cleanStatusCode = (value: unknown): number | null => {
  const parsed = cleanInteger(value)
  if (!parsed || parsed < 100 || parsed > 599) return null
  return parsed
}

const cleanUuid = (value: unknown): string | null => {
  const cleaned = cleanString(value, 80)
  return cleaned && UUID_PATTERN.test(cleaned) ? cleaned : null
}

const cleanIp = (value: unknown): string | null => {
  const cleaned = cleanString(value, 120)?.split(',')[0]?.trim()
  if (!cleaned || !isIP(cleaned)) return null
  return cleaned
}

const toRedactedJson = (value: unknown, depth = 0): unknown => {
  if (depth > 5) return '[MaxDepth]'
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return cleanString(value, 4000)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`
  if (value instanceof Error) {
    return {
      name: value.name,
      message: cleanString(value.message, 2000),
      stack: cleanString(value.stack, 8000)
    }
  }
  if (Array.isArray(value)) return value.slice(0, 100).map(item => toRedactedJson(item, depth + 1))
  if (!isRecord(value)) return String(value)

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 150)
      .map(([key, nestedValue]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : toRedactedJson(nestedValue, depth + 1)
      ])
  )
}

const buildFingerprint = (input: {
  sourceApp: string
  route: string | null
  file: string | null
  message: string
  explicitFingerprint?: string | null
}) => {
  const explicit = cleanString(input.explicitFingerprint, 200)
  if (explicit) return explicit

  const normalizedMessage = input.message
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
    .replace(/\b\d{5,}\b/g, ':number')
    .slice(0, 300)

  return createHash('sha256')
    .update([input.sourceApp, input.file, input.route, normalizedMessage].filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 40)
}

const getRelease = () => {
  return cleanString(process.env.SOURCE_VERSION, 120)
    ?? cleanString(process.env.HEROKU_SLUG_COMMIT, 120)
    ?? cleanString(process.env.HEROKU_RELEASE_VERSION, 120)
}

export const reportAppError = async (event: H3Event, input: ReportAppErrorInput): Promise<void> => {
  try {
    const now = new Date().toISOString()
    const requestUrl = getRequestURL(event)
    const sourceApp = cleanString(input.sourceApp, 80) ?? 'unknown'
    const message = cleanString(input.message, 4000) ?? 'Unknown application error'
    const route = cleanString(input.route, 300) ?? requestUrl.pathname
    const file = cleanString(input.file, 300)
    const severity = normalizeSeverity(input.severity)
    const fingerprint = buildFingerprint({
      sourceApp,
      route,
      file,
      message,
      explicitFingerprint: input.fingerprint
    })
    const supabase = serverSupabaseServiceRole(event) as SupabaseClient

    const { data: existingGroup } = await supabase
      .from('app_error_groups')
      .select('id, occurrence_count, source_apps')
      .eq('fingerprint', fingerprint)
      .maybeSingle()

    let groupId: string | null = typeof existingGroup?.id === 'string' ? existingGroup.id : null

    if (groupId) {
      const sourceApps = Array.from(new Set([
        ...(Array.isArray(existingGroup.source_apps) ? existingGroup.source_apps : []),
        sourceApp
      ]))
      await supabase
        .from('app_error_groups')
        .update({
          last_seen_at: now,
          occurrence_count: (cleanInteger(existingGroup.occurrence_count) ?? 0) + 1,
          source_apps: sourceApps,
          severity
        })
        .eq('id', groupId)
    } else {
      const { data: insertedGroup } = await supabase
        .from('app_error_groups')
        .insert({
          fingerprint,
          title: message.slice(0, 180),
          severity,
          source_apps: [sourceApp],
          first_seen_at: now,
          last_seen_at: now,
          occurrence_count: 1,
          metadata: {}
        })
        .select('id')
        .maybeSingle()

      groupId = typeof insertedGroup?.id === 'string' ? insertedGroup.id : null
    }

    await supabase
      .from('app_error_events')
      .insert({
        occurred_at: now,
        group_id: groupId,
        source_app: sourceApp,
        runtime: cleanString(input.runtime, 80) ?? 'nitro',
        environment: process.env.NODE_ENV ?? 'production',
        release: getRelease(),
        severity,
        fingerprint,
        request_id: cleanString(getHeader(event, 'x-request-id'), 200),
        route,
        method: cleanString(input.method, 20) ?? event.node.req.method ?? null,
        status_code: cleanStatusCode(input.statusCode),
        file,
        user_id: cleanUuid(input.userId),
        message_internal: message,
        message_public: cleanString(input.publicMessage, 500),
        stack_trace: cleanString(input.stackTrace, 12000),
        origin_ip: cleanIp(getRequestIP(event, { xForwardedFor: true })),
        user_agent: cleanString(getHeader(event, 'user-agent'), 1000),
        metadata_redacted: toRedactedJson(input.metadata) ?? {}
      })
  } catch (error) {
    console.error('app error reporting failed', error)
  }
}
