import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { shouldDisarmAwayOnly } from '../server/utils/access/alarmDisarmPolicy.ts'

test('daytime booking disarms Away only, preserving Home and other known modes', () => {
  assert.equal(shouldDisarmAwayOnly('armed_away'), true)
  for (const state of ['armed_home', 'disarmed', 'armed_night', 'arming', 'pending', 'triggered']) {
    assert.equal(shouldDisarmAwayOnly(state), false)
  }
})

test('unreadable alarm state fails rather than silently skipping', () => {
  for (const state of [null, '', 'unknown', 'unavailable']) {
    assert.throws(() => shouldDisarmAwayOnly(state), /Cannot safely check/)
  }
})

test('booking entry paths enforce Away-only checks and retain arming restrictions and alerts', () => {
  const jobs = readFileSync(new URL('../server/utils/access/jobs.ts', import.meta.url), 'utf8')
  const unlock = readFileSync(new URL('../server/api/internal/access/lock-event.post.ts', import.meta.url), 'utf8')
  const provider = readFileSync(new URL('../server/utils/access/providers.ts', import.meta.url), 'utf8')
  for (const source of [jobs, unlock]) assert.match(source, /onlyIfAway: !isOutsideAbodeArmingGap\(\)/)
  assert.match(jobs, /const shouldAlert = params.attempts === 1 \|\| isDead/)
  assert.match(unlock, /if \(!activeBookingId\)/)
  assert.match(unlock, /incidentType: 'abode_automation_failure'/)
  assert.match(provider, /waitForVerifiedAlarmState/)
  assert.match(provider, /Daytime Away-only disarming requires Home Assistant state verification/)
  const arm = jobs.slice(jobs.indexOf('async function triggerAbodeArmAwayAfterBookingEnd'), jobs.indexOf('async function triggerAbodeDisarmForWindowStart'))
  assert.match(arm, /if \(!isOutsideAbodeArmingGap\(\)\)/)
  assert.match(unlock, /permanent_slot_inside_daytime_gap/)
})
