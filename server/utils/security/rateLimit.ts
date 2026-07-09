import { createHash } from 'node:crypto'
import { getRequestIP, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'

type RateLimitOptions = {
  scope: string
  limit: number
  windowMs: number
  identifier?: string | null
  includeIp?: boolean
}

type RateLimitBucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, RateLimitBucket>()
let lastCleanupAt = 0

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < 60_000 && buckets.size < 10_000) return
  lastCleanupAt = now

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function enforceRateLimit(event: H3Event, options: RateLimitOptions) {
  const now = Date.now()
  cleanupExpiredBuckets(now)

  const includeIp = options.includeIp !== false
  const ip = includeIp
    ? getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
    : 'all'
  const identifier = options.identifier?.trim().toLowerCase() || 'anonymous'
  const bucketKey = fingerprint(`${options.scope}:${ip}:${identifier}`)
  const current = buckets.get(bucketKey)
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + options.windowMs }
    : current

  bucket.count += 1
  buckets.set(bucketKey, bucket)

  const remaining = Math.max(0, options.limit - bucket.count)
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  setResponseHeader(event, 'X-RateLimit-Limit', String(options.limit))
  setResponseHeader(event, 'X-RateLimit-Remaining', String(remaining))
  setResponseHeader(event, 'X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

  if (bucket.count <= options.limit) return

  setResponseHeader(event, 'Retry-After', retryAfterSeconds)
  throw createError({
    statusCode: 429,
    statusMessage: 'Too many requests. Please wait before trying again.'
  })
}
