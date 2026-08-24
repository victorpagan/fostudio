import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DateTime } from 'luxon'
import {
  computeBookingEndJobTimes,
  shouldScheduleAbodeArmAfterBookingEnd
} from '../server/utils/access/bookingEndPolicy.ts'
import { isOutsideAbodeArmingGap } from '../server/utils/access/policy.ts'

test('booking-end alarm policy leaves the 7 PM to 9 PM buffer untouched', () => {
  assert.equal(shouldScheduleAbodeArmAfterBookingEnd('2026-08-23T18:59:00-07:00'), false)
  assert.equal(shouldScheduleAbodeArmAfterBookingEnd('2026-08-23T19:00:00-07:00'), false)
  assert.equal(shouldScheduleAbodeArmAfterBookingEnd('2026-08-23T20:59:00-07:00'), false)
})

test('shared Abode automation leaves the current state untouched from 7 PM to 9 PM', () => {
  assert.equal(isOutsideAbodeArmingGap(DateTime.fromISO('2026-08-23T18:59:59-07:00')), false)
  assert.equal(isOutsideAbodeArmingGap(DateTime.fromISO('2026-08-23T19:00:00-07:00')), false)
  assert.equal(isOutsideAbodeArmingGap(DateTime.fromISO('2026-08-23T20:59:59-07:00')), false)
  assert.equal(isOutsideAbodeArmingGap(DateTime.fromISO('2026-08-23T21:00:00-07:00')), true)
})

test('booking-end alarm policy schedules genuinely out-of-hours endings', () => {
  assert.equal(shouldScheduleAbodeArmAfterBookingEnd('2026-08-23T21:00:00-07:00'), true)
  assert.equal(shouldScheduleAbodeArmAfterBookingEnd('2026-08-23T10:59:00-07:00'), true)
  assert.equal(shouldScheduleAbodeArmAfterBookingEnd('2026-08-23T11:00:00-07:00'), false)
})

test('booking-end jobs use the 15-minute reminder and 60-minute arm delay', () => {
  const schedule = computeBookingEndJobTimes('2026-08-23T21:00:00-07:00')

  assert.equal(schedule.reminderAt.toISO(), '2026-08-23T20:45:00.000-07:00')
  assert.equal(schedule.armAt.toISO(), '2026-08-23T22:00:00.000-07:00')
})
