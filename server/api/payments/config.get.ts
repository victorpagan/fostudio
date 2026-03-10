import { getServerConfig, getKey } from '~~/server/utils/config/secret'

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function pickString(value: unknown, keys: string[]) {
  const direct = normalizeString(value)
  if (direct) return direct
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = normalizeString(record[key])
    if (candidate) return candidate
  }
  return null
}

export default defineEventHandler(async (event) => {
  const squareConfigValue = await getServerConfig(event, 'SQUARE').catch(() => null)

  const locationId = pickString(await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID').catch(() => null), ['id', 'value', 'locationId', 'location_id'])
    ?? pickString(await getServerConfig(event, 'SQUARE_LOCATION_ID').catch(() => null), ['id', 'value', 'locationId', 'location_id'])
    ?? pickString(squareConfigValue, ['locationId', 'location_id', 'location', 'squareLocationId', 'square_location_id'])
    ?? normalizeString(await getKey(event, 'SQUARE_STUDIO_LOCATION_ID').catch(() => null))
    ?? normalizeString(await getKey(event, 'SQUARE_LOCATION_ID').catch(() => null))
    ?? normalizeString(process.env.SQUARE_STUDIO_LOCATION_ID)
    ?? normalizeString(process.env.SQUARE_LOCATION_ID)
    ?? normalizeString(process.env.NUXT_PUBLIC_SQUARE_STUDIO_LOCATION_ID)
    ?? normalizeString(process.env.NUXT_PUBLIC_SQUARE_LOCATION_ID)

  const applicationId = pickString(squareConfigValue, ['id', 'applicationId', 'application_id', 'appId', 'app_id'])
    ?? normalizeString(await getKey(event, 'SQUARE_APPLICATION_ID').catch(() => null))
    ?? normalizeString(await getKey(event, 'SQUARE_APP_ID').catch(() => null))
    ?? pickString(await getServerConfig(event, 'SQUARE_APPLICATION_ID').catch(() => null), ['id', 'value', 'applicationId', 'application_id'])
    ?? pickString(await getServerConfig(event, 'SQUARE_APP_ID').catch(() => null), ['id', 'value', 'applicationId', 'application_id'])
    ?? normalizeString(process.env.SQUARE_APPLICATION_ID)
    ?? normalizeString(process.env.SQUARE_APP_ID)
    ?? normalizeString(process.env.NUXT_PUBLIC_SQUARE_APPLICATION_ID)
    ?? normalizeString(process.env.NUXT_PUBLIC_SQUARE_APP_ID)

  if (!applicationId || !locationId) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Square Web Payments is not configured. Set Square application id and location id.'
    })
  }

  return {
    applicationId,
    locationId
  }
})
