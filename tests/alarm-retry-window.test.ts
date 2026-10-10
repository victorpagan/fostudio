import assert from 'node:assert/strict'
import test from 'node:test'
import { DateTime } from 'luxon'
import { readFileSync } from 'node:fs'
import { isBookingEndArmRetryExpired } from '../server/utils/access/bookingEndPolicy.ts'

test('arming retries expire relative to original arming time, including across midnight', () => {
  const armAt = DateTime.fromISO('2026-10-09T23:50:00-07:00')
  assert.equal(isBookingEndArmRetryExpired(armAt, armAt.plus({ minutes: 21 })), false)
  assert.equal(isBookingEndArmRetryExpired(armAt, armAt.plus({ minutes: 30 })), false)
  assert.equal(isBookingEndArmRetryExpired(armAt, armAt.plus({ minutes: 31 })), true)
  assert.equal(isBookingEndArmRetryExpired(armAt, armAt.plus({ days: 1 })), true)
  assert.equal(isBookingEndArmRetryExpired(DateTime.invalid('invalid')), true)
})

test('automatic recovery and execution both guard expired arming jobs', () => {
  const source = readFileSync('server/utils/access/jobs.ts', 'utf8')
  assert.equal((source.match(/isBookingEndArmRetryExpired\(armAt\)/g) ?? []).length, 2)
  assert.match(source, /job.job_type === 'arm_after_booking_end' && !alarmHealth\?\.ok/)
  assert.match(source, /if \(response.skipped \|\| .*response.abode/)
})
