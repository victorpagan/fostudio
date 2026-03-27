import type { H3Event } from 'h3'
import { getKey, getServerConfigMap } from '~~/server/utils/config/secret'

export type SlotKind = 'member' | 'guest'

export type SetLockCodeInput = {
  slotNumber: number
  code: string
  kind: SlotKind
  bookingId?: string | null
  userId?: string | null
  validFrom?: string | null
  validUntil?: string | null
}

export type ClearLockCodeInput = {
  slotNumber: number
  kind: SlotKind
  bookingId?: string | null
  userId?: string | null
  reason?: string | null
}

function asNumber(input: unknown, fallback: number) {
  const n = Number(input)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function asString(input: unknown) {
  if (typeof input !== 'string') return null
  const normalized = input.trim()
  return normalized ? normalized : null
}

function asLower(input: unknown) {
  const normalized = asString(input)
  return normalized ? normalized.toLowerCase() : null
}

function normalizeUrl(baseUrl: unknown, pathOrUrl: unknown, fallbackPath: string) {
  const base = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : ''
  const pathValue = typeof pathOrUrl === 'string' && pathOrUrl.trim() ? pathOrUrl.trim() : fallbackPath
  if (/^https?:\/\//i.test(pathValue)) return pathValue
  if (!base) return null
  const normalizedPath = pathValue.startsWith('/') ? pathValue : `/${pathValue}`
  return `${base}${normalizedPath}`
}

function normalizeHomeAssistantBaseUrl(input: unknown) {
  const base = asString(input)
  if (!base) return null
  return base.replace(/\/+$/, '')
}

function parseServiceRef(input: unknown, fallbackDomain: string, fallbackService: string) {
  const normalized = asString(input)
  if (!normalized) {
    return { domain: fallbackDomain, service: fallbackService }
  }

  const [left, right] = normalized.split('.', 2)
  if (right && left && right.trim()) {
    return {
      domain: left.trim().toLowerCase(),
      service: right.trim().toLowerCase()
    }
  }

  return {
    domain: fallbackDomain,
    service: normalized.toLowerCase()
  }
}

async function postJson(url: string, payload: Record<string, unknown>, options: {
  timeoutMs: number
  apiKey?: string | null
  extraHeaders?: Record<string, string>
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        ...(options.extraHeaders ?? {})
      },
      body: JSON.stringify(payload)
    })

    const raw = await res.text().catch(() => '')
    let parsed: unknown = raw
    if (raw && (raw.startsWith('{') || raw.startsWith('['))) {
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = raw
      }
    }

    return {
      ok: res.ok,
      status: res.status,
      body: parsed
    }
  } finally {
    clearTimeout(timer)
  }
}

async function postHomeAssistantService(event: H3Event, params: {
  baseUrl: unknown
  timeoutMs: number
  domain: string
  service: string
  payload: Record<string, unknown>
}) {
  const baseUrl = normalizeHomeAssistantBaseUrl(params.baseUrl)
  if (!baseUrl) throw new Error('HOME_ASSISTANT_BASE_URL is not configured')

  const tokenFromPrimary = await getKey(event, 'HOME_ASSISTANT_API_TOKEN').catch(() => null)
  const tokenFromLegacy = await getKey(event, 'HA_LONG_LIVED_ACCESS_TOKEN').catch(() => null)
  const token = asString(tokenFromPrimary) ?? asString(tokenFromLegacy)
  if (!token) throw new Error('HOME_ASSISTANT_API_TOKEN is not configured')

  const url = `${baseUrl}/api/services/${params.domain}/${params.service}`

  const result = await postJson(url, params.payload, {
    timeoutMs: params.timeoutMs,
    apiKey: token
  })

  if (!result.ok) {
    throw new Error(
      `Home Assistant ${params.domain}.${params.service} failed (${result.status}): ${JSON.stringify(result.body)}`
    )
  }

  return result
}

export async function isLockSyncEnabled(event: H3Event) {
  const config = await getServerConfigMap(event, ['LOCK_SYNC_ENABLED'])
  const value = config.LOCK_SYNC_ENABLED
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
  return false
}

export async function setLockUserCode(event: H3Event, input: SetLockCodeInput) {
  const config = await getServerConfigMap(event, [
    'LOCK_PROVIDER_MODE',
    'LOCK_PROVIDER_BASE_URL',
    'LOCK_PROVIDER_SET_CODE_PATH',
    'LOCK_PROVIDER_TIMEOUT_MS',
    'HOME_ASSISTANT_BASE_URL',
    'HOME_ASSISTANT_LOCK_ENTITY_ID'
  ])

  const timeoutMs = asNumber(config.LOCK_PROVIDER_TIMEOUT_MS, 8000)
  const providerMode = asLower(config.LOCK_PROVIDER_MODE) ?? 'generic_webhook'

  if (providerMode === 'home_assistant') {
    const entityId = asString(config.HOME_ASSISTANT_LOCK_ENTITY_ID)
    if (!entityId) throw new Error('HOME_ASSISTANT_LOCK_ENTITY_ID is not configured')

    return postHomeAssistantService(event, {
      baseUrl: config.HOME_ASSISTANT_BASE_URL,
      timeoutMs,
      domain: 'zwave_js',
      service: 'set_lock_usercode',
      payload: {
        entity_id: entityId,
        code_slot: input.slotNumber,
        usercode: input.code
      }
    })
  }

  const url = normalizeUrl(
    config.LOCK_PROVIDER_BASE_URL,
    config.LOCK_PROVIDER_SET_CODE_PATH,
    '/api/lock/code/set'
  )

  if (!url) {
    throw new Error('Lock provider URL is not configured')
  }

  const apiKey = await getKey(event, 'LOCK_PROVIDER_API_KEY').catch(() => null)

  const result = await postJson(url, {
    action: 'set_code',
    slotNumber: input.slotNumber,
    code: input.code,
    kind: input.kind,
    bookingId: input.bookingId ?? null,
    userId: input.userId ?? null,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null
  }, {
    timeoutMs,
    apiKey: typeof apiKey === 'string' ? apiKey : null
  })

  if (!result.ok) {
    throw new Error(`Lock provider set_code failed (${result.status}): ${JSON.stringify(result.body)}`)
  }

  return result
}

export async function clearLockUserCode(event: H3Event, input: ClearLockCodeInput) {
  const config = await getServerConfigMap(event, [
    'LOCK_PROVIDER_MODE',
    'LOCK_PROVIDER_BASE_URL',
    'LOCK_PROVIDER_CLEAR_CODE_PATH',
    'LOCK_PROVIDER_TIMEOUT_MS',
    'HOME_ASSISTANT_BASE_URL',
    'HOME_ASSISTANT_LOCK_ENTITY_ID'
  ])

  const timeoutMs = asNumber(config.LOCK_PROVIDER_TIMEOUT_MS, 8000)
  const providerMode = asLower(config.LOCK_PROVIDER_MODE) ?? 'generic_webhook'

  if (providerMode === 'home_assistant') {
    const entityId = asString(config.HOME_ASSISTANT_LOCK_ENTITY_ID)
    if (!entityId) throw new Error('HOME_ASSISTANT_LOCK_ENTITY_ID is not configured')

    return postHomeAssistantService(event, {
      baseUrl: config.HOME_ASSISTANT_BASE_URL,
      timeoutMs,
      domain: 'zwave_js',
      service: 'clear_lock_usercode',
      payload: {
        entity_id: entityId,
        code_slot: input.slotNumber
      }
    })
  }

  const url = normalizeUrl(
    config.LOCK_PROVIDER_BASE_URL,
    config.LOCK_PROVIDER_CLEAR_CODE_PATH,
    '/api/lock/code/clear'
  )

  if (!url) {
    throw new Error('Lock provider URL is not configured')
  }

  const apiKey = await getKey(event, 'LOCK_PROVIDER_API_KEY').catch(() => null)

  const result = await postJson(url, {
    action: 'clear_code',
    slotNumber: input.slotNumber,
    kind: input.kind,
    bookingId: input.bookingId ?? null,
    userId: input.userId ?? null,
    reason: input.reason ?? null
  }, {
    timeoutMs,
    apiKey: typeof apiKey === 'string' ? apiKey : null
  })

  if (!result.ok) {
    throw new Error(`Lock provider clear_code failed (${result.status}): ${JSON.stringify(result.body)}`)
  }

  return result
}

export async function sendAbodeAutomationEvent(event: H3Event, payload: {
  eventType: string
  bookingId?: string | null
  userId?: string | null
  lockSlot?: number | null
  occurredAt?: string | null
}) {
  const config = await getServerConfigMap(event, [
    'ABODE_PROVIDER_MODE',
    'ABODE_AUTOMATION_WEBHOOK_URL',
    'ABODE_AUTOMATION_TIMEOUT_MS',
    'HOME_ASSISTANT_BASE_URL',
    'HOME_ASSISTANT_ABODE_ALARM_ENTITY_ID',
    'HOME_ASSISTANT_ABODE_UNLOCK_ACTION',
    'HOME_ASSISTANT_ABODE_ARM_AWAY_ACTION'
  ])

  const providerMode = asLower(config.ABODE_PROVIDER_MODE) ?? 'webhook'
  const timeoutMs = asNumber(config.ABODE_AUTOMATION_TIMEOUT_MS, 8000)

  if (providerMode === 'home_assistant') {
    const entityId = asString(config.HOME_ASSISTANT_ABODE_ALARM_ENTITY_ID)
    if (!entityId) {
      throw new Error('HOME_ASSISTANT_ABODE_ALARM_ENTITY_ID is not configured')
    }

    const actionRef = payload.eventType === 'unlock_disarm_home'
      ? parseServiceRef(config.HOME_ASSISTANT_ABODE_UNLOCK_ACTION, 'alarm_control_panel', 'alarm_disarm')
      : payload.eventType === 'booking_window_end_arm_away'
        ? parseServiceRef(config.HOME_ASSISTANT_ABODE_ARM_AWAY_ACTION, 'alarm_control_panel', 'alarm_arm_away')
        : null

    if (!actionRef) {
      return {
        ok: false,
        skipped: 'unsupported_abode_event_type' as const,
        eventType: payload.eventType
      }
    }

    const alarmCodePrimary = await getKey(event, 'HOME_ASSISTANT_ABODE_ALARM_CODE').catch(() => null)
    const alarmCodeLegacy = await getKey(event, 'HA_ABODE_ALARM_CODE').catch(() => null)
    const alarmCode = asString(alarmCodePrimary) ?? asString(alarmCodeLegacy)

    const result = await postHomeAssistantService(event, {
      baseUrl: config.HOME_ASSISTANT_BASE_URL,
      timeoutMs,
      domain: actionRef.domain,
      service: actionRef.service,
      payload: {
        entity_id: entityId,
        ...(alarmCode ? { code: alarmCode } : {})
      }
    })

    return {
      ok: true as const,
      mode: 'home_assistant' as const,
      action: `${actionRef.domain}.${actionRef.service}`,
      result
    }
  }

  const url = typeof config.ABODE_AUTOMATION_WEBHOOK_URL === 'string'
    ? config.ABODE_AUTOMATION_WEBHOOK_URL.trim()
    : ''

  if (!url) {
    return { ok: false, skipped: 'abode_webhook_not_configured' as const }
  }

  const apiKey = await getKey(event, 'ABODE_AUTOMATION_WEBHOOK_KEY').catch(() => null)

  const result = await postJson(url, {
    ...payload,
    source: 'fostudio'
  }, {
    timeoutMs,
    apiKey: typeof apiKey === 'string' ? apiKey : null
  })

  if (!result.ok) {
    throw new Error(`Abode webhook failed (${result.status}): ${JSON.stringify(result.body)}`)
  }

  return { ok: true as const, result }
}
