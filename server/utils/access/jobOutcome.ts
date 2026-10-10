function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function accessJobOutcome(job: { status: string, attempts: number, payload?: unknown, last_response?: unknown, processed_at?: string | null }) {
  const payload = record(job.payload)
  const response = record(job.last_response)
  const lock = record(record(response.provider).verification)
  const alarm = record(record(response.abode).verification)
  const retried = job.attempts > 1 || Boolean(payload.manualRetry) || Number(record(payload.automaticRecovery).count) > 0
  const alarmSkip = record(response.abode).skipped
  const skipped = typeof response.skipped === 'string'
    ? response.skipped
    : lock.verified !== true && typeof alarmSkip === 'string' ? alarmSkip : null
  const evidence: string[] = []
  if (lock.verified === true) evidence.push(lock.inUse === true ? 'Lock code installation verified' : 'Lock code removal verified')
  if (alarm.verified === true && ['disarmed', 'armed_away', 'armed_home'].includes(String(alarm.state))) evidence.push(`Alarm verified ${alarm.state}`)
  const outcome = job.status === 'succeeded'
    ? skipped ? 'Skipped' : evidence.length ? 'Verified' : 'Completed (unverified)'
    : job.status === 'dead' ? 'Failed' : job.status === 'pending' ? retried || job.attempts > 0 ? 'Retry pending' : 'Scheduled' : 'Running'
  return {
    label: outcome === 'Verified' && retried ? 'Verified after retry' : outcome,
    verified: outcome === 'Verified',
    retried,
    completedAt: job.processed_at ?? null,
    evidence,
    skipReason: skipped
  }
}
