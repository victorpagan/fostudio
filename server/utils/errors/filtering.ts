import { getRequestURL, type H3Event } from 'h3'

type ErrorLike = {
  message?: unknown
  status?: unknown
  statusCode?: unknown
  statusMessage?: unknown
  stack?: unknown
}

const isErrorLike = (value: unknown): value is ErrorLike => {
  return Boolean(value) && typeof value === 'object'
}

const toStatusCode = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed >= 100 && parsed <= 599) return parsed
  }
  return null
}

export const getErrorStatusCode = (error: unknown): number | null => {
  if (!isErrorLike(error)) return null
  return toStatusCode(error.statusCode) ?? toStatusCode(error.status)
}

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (isErrorLike(error) && typeof error.statusMessage === 'string' && error.statusMessage.trim()) return error.statusMessage
  if (isErrorLike(error) && typeof error.message === 'string' && error.message.trim()) return error.message
  return String(error)
}

export const getErrorStackTrace = (error: unknown): string | null => {
  if (error instanceof Error) return error.stack ?? null
  if (isErrorLike(error) && typeof error.stack === 'string') return error.stack
  return null
}

const isIgnorableNotFoundPath = (pathname: string): boolean => {
  return [
    /^\/_nuxt\//,
    /\.map$/,
    /^\/(site|wordpress|wp)(\/|$)/,
    /\/wp-(admin|content|includes)(\/|$)/,
    /(^|\/)(wlwmanifest\.xml|xmlrpc\.php)$/i
  ].some(pattern => pattern.test(pathname))
}

export const shouldReportAppError = (error: unknown, event: H3Event): boolean => {
  const statusCode = getErrorStatusCode(error)
  const pathname = getRequestURL(event).pathname

  // User/admin route auth denials are expected control flow. Keep internal worker auth
  // failures reportable because those can indicate broken schedulers or bad shared keys.
  if ((statusCode === 401 || statusCode === 403) && !pathname.startsWith('/api/internal/')) return false

  if (statusCode === 404 && isIgnorableNotFoundPath(pathname)) return false

  return true
}
