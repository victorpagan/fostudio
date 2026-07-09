/**
 * Recursively sanitize an object for JSON serialization.
 * Converts BigInts to strings to avoid serialization errors.
 */
import type { Json } from '~~/app/types/database.types'

export function sanitizeForJSON(obj: unknown): Json | undefined {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === 'bigint') {
    return obj.toString()
  }

  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(value => sanitizeForJSON(value) ?? null)
    }

    const sanitized: Record<string, Json> = {}
    for (const [key, value] of Object.entries(obj)) {
      const safeValue = sanitizeForJSON(value)
      if (typeof safeValue !== 'undefined') sanitized[key] = safeValue
    }
    return sanitized
  }

  if (typeof obj === 'string' || typeof obj === 'boolean') return obj
  if (typeof obj === 'number') return Number.isFinite(obj) ? obj : null

  return undefined
}
