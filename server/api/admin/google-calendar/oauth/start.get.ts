import { sendRedirect } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { buildGoogleOauthConnectUrl } from '~~/server/utils/integrations/googleCalendar'

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)

  try {
    const url = await buildGoogleOauthConnectUrl(event)
    return sendRedirect(event, url, 302)
  } catch (error: unknown) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Could not start Google OAuth connect flow'
    })
  }
})

