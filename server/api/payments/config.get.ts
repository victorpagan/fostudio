import { getServerConfig, getKey } from '~~/server/utils/config/secret'

export default defineEventHandler(async (event) => {
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID').catch(() => null)
  const appIdPrimary = await getKey(event, 'SQUARE_APPLICATION_ID').catch(() => null)
  const appIdFallback = await getKey(event, 'SQUARE_APP_ID').catch(() => null)

  const applicationId = typeof appIdPrimary === 'string' && appIdPrimary.trim()
    ? appIdPrimary.trim()
    : typeof appIdFallback === 'string' && appIdFallback.trim()
      ? appIdFallback.trim()
      : null
  const normalizedLocationId = typeof locationId === 'string' && locationId.trim()
    ? locationId.trim()
    : null

  if (!applicationId || !normalizedLocationId) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Square Web Payments is not configured. Missing app id or location id.'
    })
  }

  return {
    applicationId,
    locationId: normalizedLocationId
  }
})
