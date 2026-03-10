import { getServerConfig, getKey } from '~~/server/utils/config/secret'

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export default defineEventHandler(async (event) => {
  const locationId = normalizeString(await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID').catch(() => null))
    ?? normalizeString(await getServerConfig(event, 'SQUARE_LOCATION_ID').catch(() => null))
    ?? normalizeString(await getKey(event, 'SQUARE_STUDIO_LOCATION_ID').catch(() => null))
    ?? normalizeString(await getKey(event, 'SQUARE_LOCATION_ID').catch(() => null))
    ?? normalizeString(process.env.SQUARE_STUDIO_LOCATION_ID)
    ?? normalizeString(process.env.SQUARE_LOCATION_ID)
    ?? normalizeString(process.env.NUXT_PUBLIC_SQUARE_STUDIO_LOCATION_ID)
    ?? normalizeString(process.env.NUXT_PUBLIC_SQUARE_LOCATION_ID)

  const applicationId = normalizeString(await getKey(event, 'SQUARE_APPLICATION_ID').catch(() => null))
    ?? normalizeString(await getKey(event, 'SQUARE_APP_ID').catch(() => null))
    ?? normalizeString(await getServerConfig(event, 'SQUARE_APPLICATION_ID').catch(() => null))
    ?? normalizeString(await getServerConfig(event, 'SQUARE_APP_ID').catch(() => null))
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
