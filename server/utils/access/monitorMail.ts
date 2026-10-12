import { createHash } from 'node:crypto'

export function monitorMailOperationKey(eventId: string | number) {
  // UUIDv5 in the standard URL namespace: stable across cron retries/restarts.
  const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex')
  const bytes = createHash('sha1').update(namespace)
    .update(`https://fo.studio/access-monitor/events/${eventId}`).digest().subarray(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function monitorMailWasSent(data: unknown) {
  if (!data || typeof data !== 'object') return false
  const result = data as Record<string, unknown>
  return result.success === true && result.sent_customer === true && !result.skipped_reason
}
