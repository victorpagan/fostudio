import assert from 'node:assert/strict'
import test from 'node:test'
import { accessJobOutcome } from '../server/utils/access/jobOutcome.ts'

test('verified retry exposes safe evidence, not codes or provider response', () => {
  const result = accessJobOutcome({ status: 'succeeded', attempts: 2, processed_at: '2026-10-10T00:00:00Z', last_response: { provider: { verification: { verified: true, inUse: true }, response: { code: 'secret' } }, abode: { verification: { verified: true, state: 'disarmed' } } } })
  assert.equal(result.label, 'Verified after retry')
  assert.equal(result.evidence.length, 2)
  assert.equal(result.completedAt, '2026-10-10T00:00:00Z')
  assert.ok(!JSON.stringify(result).includes('secret'))
})
test('skipped and unverified successes never claim verified recovery', () => {
  assert.equal(accessJobOutcome({ status: 'succeeded', attempts: 2, last_response: { skipped: 'no_active_booking_window' } }).label, 'Skipped')
  assert.equal(accessJobOutcome({ status: 'succeeded', attempts: 2, last_response: { ok: true } }).verified, false)
})
test('reset retry cycles retain retry identity without claiming success', () => {
  for (const payload of [{ manualRetry: { requestedAt: 'today' } }, { automaticRecovery: { count: 1 } }]) {
    assert.equal(accessJobOutcome({ status: 'pending', attempts: 0, payload }).label, 'Retry pending')
  }
  assert.equal(accessJobOutcome({ status: 'dead', attempts: 4 }).label, 'Failed')
  assert.equal(accessJobOutcome({ status: 'pending', attempts: 0 }).label, 'Scheduled')
})

test('nested alarm skips are not reported as physical recovery', () => {
  const result = accessJobOutcome({ status: 'succeeded', attempts: 2, last_response: { abode: { skipped: 'inside_daytime_gap' } } })
  assert.equal(result.label, 'Skipped')
  assert.equal(result.verified, false)
})
