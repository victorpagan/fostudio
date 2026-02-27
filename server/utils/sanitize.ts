/**
 * Recursively sanitize an object for JSON serialization.
 * Converts BigInts to strings to avoid serialization errors.
 */
export function sanitizeForJSON(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (typeof obj === 'bigint') {
    return obj.toString()
  }

  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(sanitizeForJSON)
    }

    const sanitized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeForJSON(value)
    }
    return sanitized
  }

  return obj
}
