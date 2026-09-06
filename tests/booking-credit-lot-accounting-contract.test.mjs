import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('booking mutations use expiry-preserving credit lot RPCs', async () => {
  const [memberReschedule, memberCancel, adminCancel, adminReschedule] = await Promise.all([
    readProjectFile('server/api/bookings/[id]/reschedule.post.ts'),
    readProjectFile('server/api/bookings/[id].delete.ts'),
    readProjectFile('server/api/admin/bookings/cancel.post.ts'),
    readProjectFile('server/api/admin/bookings/reschedule.post.ts')
  ])

  assert.match(memberReschedule, /reschedule_booking_with_credit_adjustment/)
  assert.match(memberReschedule, /consume_credit_lots/)
  assert.match(memberCancel, /cancel_booking_with_credit_refund/)
  assert.match(adminCancel, /cancel_booking_with_credit_refund/)
  assert.match(adminReschedule, /refund_booking_credit_lots/)

  for (const route of [memberReschedule, memberCancel, adminCancel, adminReschedule]) {
    assert.doesNotMatch(
      route,
      /\.from\(['"]credits_ledger['"]\)[\s\S]{0,180}?\.insert\(/,
      'booking mutations must not bypass credit lot allocation with direct ledger inserts'
    )
  }
})
