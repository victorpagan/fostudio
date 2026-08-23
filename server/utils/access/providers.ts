import type { H3Event } from 'h3'
import { getKey, getServerConfigMap } from '~~/server/utils/config/secret'

export type SlotKind = 'member' | 'guest' | 'permanent'

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

export type LockProviderHealth = {
  ok: boolean
  mode: string
  state: string | null
  reason?: string | null
}

type HomeAssistantEntityState = {
  entity_id?: string
  state?: string
}

type HomeAssistantLockCodeResponse = {
  in_use?: boolean
  usercode?: string | null
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
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error(`Request timed out after ${options.timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function getJson(url: string, options: {
  timeoutMs: number
  apiKey?: string | null
}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {})
      }
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
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error(`Request timed out after ${options.timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function getHomeAssistantToken(event: H3Event) {
  const tokenFromPrimary = await getKey(event, 'HOME_ASSISTANT_API_TOKEN').catch(() => null)
  const tokenFromLegacy = await getKey(event, 'HA_LONG_LIVED_ACCESS_TOKEN').catch(() => null)
  const token = asString(tokenFromPrimary) ?? asString(tokenFromLegacy)
  if (!token) throw new Error('HOME_ASSISTANT_API_TOKEN is not configured')
  return token
}

async function getHomeAssistantEntityState(event: H3Event, params: {
  baseUrl: unknown
  timeoutMs: number
  entityId: string
}) {
  const baseUrl = normalizeHomeAssistantBaseUrl(params.baseUrl)
  if (!baseUrl) throw new Error('HOME_ASSISTANT_BASE_URL is not configured')

  const token = await getHomeAssistantToken(event)
  let result: Awaited<ReturnType<typeof getJson>>
  try {
    result = await getJson(`${baseUrl}/api/states/${encodeURIComponent(params.entityId)}`, {
      timeoutMs: params.timeoutMs,
      apiKey: token
    })
  } catch (error) {
    throw new Error(
      `Home Assistant state lookup for ${params.entityId} failed: ${(error as Error)?.message ?? String(error)}`
    )
  }

  if (!result.ok) {
    throw new Error(
      `Home Assistant state lookup for ${params.entityId} failed (${result.status}): ${JSON.stringify(result.body)}`
    )
  }

  const body = result.body as HomeAssistantEntityState | null
  return asLower(body?.state)
}

async function postHomeAssistantService(event: H3Event, params: {
  baseUrl: unknown
  timeoutMs: number
  domain: string
  service: string
  payload: Record<string, unknown>
  returnResponse?: boolean
}) {
  const baseUrl = normalizeHomeAssistantBaseUrl(params.baseUrl)
  if (!baseUrl) throw new Error('HOME_ASSISTANT_BASE_URL is not configured')

  const token = await getHomeAssistantToken(event)

  const url = `${baseUrl}/api/services/${params.domain}/${params.service}${params.returnResponse ? '?return_response' : ''}`

  let result: Awaited<ReturnType<typeof postJson>>
  try {
    result = await postJson(url, params.payload, {
      timeoutMs: params.timeoutMs,
      apiKey: token
    })
  } catch (error) {
    throw new Error(
      `Home Assistant ${params.domain}.${params.service} failed: ${(error as Error)?.message ?? String(error)}`
    )
  }

  if (!result.ok) {
    throw new Error(
      `Home Assistant ${params.domain}.${params.service} failed (${result.status}): ${JSON.stringify(result.body)}`
    )
  }

  return result
}

async function readHomeAssistantLockCode(event: H3Event, params: {
  baseUrl: unknown
  timeoutMs: number
  entityId: string
  slotNumber: number
}) {
  const result = await postHomeAssistantService(event, {
    baseUrl: params.baseUrl,
    timeoutMs: params.timeoutMs,
    domain: 'zwave_js',
    service: 'get_lock_usercode',
    returnResponse: true,
    payload: {
      entity_id: params.entityId,
      code_slot: params.slotNumber
    }
  })

  const body = result.body as {
    service_response?: Record<string, Record<string, HomeAssistantLockCodeResponse>>
  } | null
  const slot = body?.service_response?.[params.entityId]?.[String(params.slotNumber)]
  if (!slot || typeof slot.in_use !== 'boolean') {
    throw new Error(`Home Assistant returned no user-code state for lock slot ${params.slotNumber}`)
  }

  return {
    inUse: slot.in_use,
    usercode: typeof slot.usercode === 'string' ? slot.usercode : ''
  }
}

async function waitForVerifiedLockCode(event: H3Event, params: {
  baseUrl: unknown
  timeoutMs: number
  entityId: string
  slotNumber: number
  expectedCode: string | null
}) {
  let lastResult: { inUse: boolean, usercode: string } | null = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, attempt * 350))
    lastResult = await readHomeAssistantLockCode(event, params)
    const verified = params.expectedCode === null
      ? !lastResult.inUse && !lastResult.usercode
      : lastResult.inUse && lastResult.usercode === params.expectedCode

    if (verified) {
      return {
        verified: true as const,
        inUse: lastResult.inUse
      }
    }
  }

  const expected = params.expectedCode === null ? 'empty' : 'assigned'
  const actual = lastResult?.inUse ? 'assigned with a different code' : 'empty'
  throw new Error(`Lock slot ${params.slotNumber} verification failed: expected ${expected}, found ${actual}`)
}

async function waitForVerifiedAlarmState(event: H3Event, params: {
  baseUrl: unknown
  timeoutMs: number
  entityId: string
  expectedState: string
}) {
  let lastState: string | null = null
  let lastError: string | null = null
  const retryDelaysMs = [0, 300, 700, 1400]

  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))

    try {
      lastState = await getHomeAssistantEntityState(event, {
        baseUrl: params.baseUrl,
        timeoutMs: Math.min(params.timeoutMs, 2500),
        entityId: params.entityId
      })
      lastError = null
    } catch (error) {
      lastError = (error as Error)?.message ?? String(error)
    }

    if (lastState === params.expectedState) {
      return {
        verified: true as const,
        state: lastState
      }
    }
  }

  const actual = lastState
    ? `found ${lastState}`
    : lastError
      ? `state lookup failed: ${lastError}`
      : 'state was missing'
  throw new Error(`Alarm entity ${params.entityId} verification failed: expected ${params.expectedState}, ${actual}`)
}

export async function getLockProviderHealth(event: H3Event): Promise<LockProviderHealth> {
  const config = await getServerConfigMap(event, [
    'LOCK_PROVIDER_MODE',
    'LOCK_PROVIDER_TIMEOUT_MS',
    'HOME_ASSISTANT_BASE_URL',
    'HOME_ASSISTANT_LOCK_ENTITY_ID'
  ])
  const providerMode = asLower(config.LOCK_PROVIDER_MODE) ?? 'generic_webhook'
  if (providerMode !== 'home_assistant') {
    return { ok: true, mode: providerMode, state: null }
  }

  const entityId = asString(config.HOME_ASSISTANT_LOCK_ENTITY_ID)
  if (!entityId) {
    return { ok: false, mode: providerMode, state: null, reason: 'HOME_ASSISTANT_LOCK_ENTITY_ID is not configured' }
  }

  try {
    const state = await getHomeAssistantEntityState(event, {
      baseUrl: config.HOME_ASSISTANT_BASE_URL,
      timeoutMs: asNumber(config.LOCK_PROVIDER_TIMEOUT_MS, 8000),
      entityId
    })
    const ok = Boolean(state && !['unknown', 'unavailable'].includes(state))
    return {
      ok,
      mode: providerMode,
      state,
      reason: ok ? null : `Home Assistant lock entity is ${state ?? 'missing'}`
    }
  } catch (error) {
    return {
      ok: false,
      mode: providerMode,
      state: null,
      reason: (error as Error)?.message ?? String(error)
    }
  }
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

    const health = await getLockProviderHealth(event)
    if (!health.ok) {
      throw new Error(health.reason ?? 'Home Assistant lock provider is unavailable')
    }

    const result = await postHomeAssistantService(event, {
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

    const verification = await waitForVerifiedLockCode(event, {
      baseUrl: config.HOME_ASSISTANT_BASE_URL,
      timeoutMs,
      entityId,
      slotNumber: input.slotNumber,
      expectedCode: input.code
    })

    return { ...result, verification }
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

    const health = await getLockProviderHealth(event)
    if (!health.ok) {
      throw new Error(health.reason ?? 'Home Assistant lock provider is unavailable')
    }

    const result = await postHomeAssistantService(event, {
      baseUrl: config.HOME_ASSISTANT_BASE_URL,
      timeoutMs,
      domain: 'zwave_js',
      service: 'clear_lock_usercode',
      payload: {
        entity_id: entityId,
        code_slot: input.slotNumber
      }
    })

    const verification = await waitForVerifiedLockCode(event, {
      baseUrl: config.HOME_ASSISTANT_BASE_URL,
      timeoutMs,
      entityId,
      slotNumber: input.slotNumber,
      expectedCode: null
    })

    return { ...result, verification }
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

    const expectedState = actionRef.service === 'alarm_disarm'
      ? 'disarmed'
      : actionRef.service === 'alarm_arm_home'
        ? 'armed_home'
        : actionRef.service === 'alarm_arm_away'
          ? 'armed_away'
          : null

    if (expectedState) {
      const currentState = await getHomeAssistantEntityState(event, {
        baseUrl: config.HOME_ASSISTANT_BASE_URL,
        timeoutMs,
        entityId
      })
      if (!currentState || ['unknown', 'unavailable'].includes(currentState)) {
        throw new Error(`Home Assistant alarm entity is ${currentState ?? 'missing'}`)
      }
      // Abode is shared control: employees and schedules can change the panel
      // independently. Use the current state only as a provider health check,
      // then always reconcile the requested state at this booking transition.
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

    const verification = expectedState
      ? await waitForVerifiedAlarmState(event, {
          baseUrl: config.HOME_ASSISTANT_BASE_URL,
          timeoutMs,
          entityId,
          expectedState
        })
      : null

    return {
      ok: true as const,
      mode: 'home_assistant' as const,
      action: `${actionRef.domain}.${actionRef.service}`,
      result,
      verification
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
