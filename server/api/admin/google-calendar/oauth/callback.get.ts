import { sendRedirect, getQuery } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { completeGoogleOauthConnect } from '~~/server/utils/integrations/googleCalendar'

function readQueryString(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.trim())
    if (typeof first === 'string' && first.trim()) return first.trim()
  }
  return ''
}

export default defineEventHandler(async (event) => {
  await requireServerAdmin(event)

  const q = getQuery(event)
  const error = readQueryString(q.error)
  const code = readQueryString(q.code)
  const state = readQueryString(q.state)
  const origin = getRequestURL(event).origin
  const basePath = '/dashboard/admin/google-calendar'

  if (error) {
    return sendRedirect(
      event,
      `${origin}${basePath}?oauth=error&message=${encodeURIComponent(error)}`,
      302
    )
  }

  if (!code || !state) {
    return sendRedirect(
      event,
      `${origin}${basePath}?oauth=error&message=${encodeURIComponent('Missing OAuth code/state')}`,
      302
    )
  }

  try {
    const result = await completeGoogleOauthConnect(event, { code, state })
    const email = result.email ? `&email=${encodeURIComponent(result.email)}` : ''
    return sendRedirect(event, `${origin}${basePath}?oauth=connected${email}`, 302)
  } catch (err: unknown) {
    return sendRedirect(
      event,
      `${origin}${basePath}?oauth=error&message=${encodeURIComponent(err instanceof Error ? err.message : 'OAuth callback failed')}`,
      302
    )
  }
})

