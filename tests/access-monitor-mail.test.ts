import assert from 'node:assert/strict'
import test from 'node:test'
import { monitorMailOperationKey, monitorMailWasSent } from '../server/utils/access/monitorMail.ts'

test('monitor retry keys satisfy Fomailer UUID contract and remain stable per event', () => {
  const key = monitorMailOperationKey(1)
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(key, monitorMailOperationKey('1'))
  assert.notEqual(key, monitorMailOperationKey(2))
})

test('only confirmed staff sends, including idempotent replays, are delivered', () => {
  assert.equal(monitorMailWasSent({ success: true, sent_customer: true }), true)
  assert.equal(monitorMailWasSent({ success: true, sent_customer: true, replayed: true }), true)
  for (const result of [null, {}, { success: false }, { success: true, sent_customer: false },
    { success: true, sent_customer: true, skipped_reason: 'event_inactive' }]) {
    assert.equal(monitorMailWasSent(result), false)
  }
})
