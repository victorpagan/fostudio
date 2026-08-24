import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('Home Assistant lock writes require health and physical slot verification', async () => {
  const provider = await readProjectFile('server/utils/access/providers.ts')

  assert.match(provider, /getLockProviderHealth/)
  assert.match(provider, /\['unknown', 'unavailable'\]/)
  assert.match(provider, /get_lock_usercode/)
  assert.match(provider, /return_response/)
  assert.match(provider, /waitForVerifiedLockCode/)
  assert.match(provider, /Lock slot .* verification failed/)
  assert.doesNotMatch(provider, /already_in_requested_state/)
  assert.match(provider, /Abode is shared control/)
  assert.match(provider, /waitForVerifiedAlarmState/)
  assert.match(provider, /Alarm entity .* verification failed/)
})

test('dead access jobs recover only while relevant and after provider recovery', async () => {
  const jobs = await readProjectFile('server/utils/access/jobs.ts')

  assert.match(jobs, /recoverDeadAccessJobs/)
  assert.match(jobs, /MAX_AUTO_RECOVERIES/)
  assert.match(jobs, /isInsideAccessWindow/)
  assert.match(jobs, /getLockProviderHealth/)
  assert.match(jobs, /provider_healthy_after_dead_job/)
  assert.match(jobs, /status:\s*'resolved'/)
  assert.match(jobs, /last_error:\s*null/)
  assert.match(jobs, /summarizeProviderResult/)
})

test('booking access disarms before arrival and delayed rearming respects every active booking', async () => {
  const jobs = await readProjectFile('server/utils/access/jobs.ts')

  assert.match(jobs, /triggerAbodeDisarmForWindowStart/)
  assert.match(jobs, /eventType:\s*'unlock_disarm_home'/)
  assert.match(jobs, /arm_after_booking_end/)
  assert.match(jobs, /expected_end_time/)
  assert.match(jobs, /triggerAbodeArmAwayAfterBookingEnd/)
  assert.match(jobs, /hasAnotherActiveBookingWindowNow/)
  assert.match(jobs, /another_active_booking_window_exists/)

  const memberDeactivation = jobs.slice(
    jobs.indexOf('async function runDeactivateMemberJob'),
    jobs.indexOf('async function runActivateGuestJob')
  )
  const guestDeactivation = jobs.slice(
    jobs.indexOf('async function runDeactivateGuestJob'),
    jobs.indexOf('async function runBookingEndingReminderJob')
  )
  assert.doesNotMatch(memberDeactivation, /triggerAbodeArmAway/)
  assert.doesNotMatch(guestDeactivation, /triggerAbodeArmAway/)
})

test('eligible booking-ending reminders use the Fomailer idempotency contract', async () => {
  const [jobs, reminder, fomailer] = await Promise.all([
    readProjectFile('server/utils/access/jobs.ts'),
    readProjectFile('server/utils/mail/bookingEndingSoonReminder.ts'),
    readProjectFile('server/utils/mail/fomailer.ts')
  ])

  assert.match(jobs, /send_booking_ending_reminder/)
  assert.match(jobs, /only booking-ending reminder jobs are processed/)
  assert.match(reminder, /booking\.endingSoonReminder/)
  assert.match(reminder, /booking_rate_kind.*standby/s)
  assert.match(reminder, /guest_extension_window_closed/)
  assert.match(reminder, /x-idempotency-key/)
  assert.match(reminder, /dashboard\/bookings\?extend=/)
  assert.match(fomailer, /booking\.endingSoonReminder/)
})

test('admin access status reports lock-provider health', async () => {
  const [endpoint, page] = await Promise.all([
    readProjectFile('server/api/admin/access/status.get.ts'),
    readProjectFile('app/pages/dashboard/admin/door-codes.vue')
  ])

  assert.match(endpoint, /getLockProviderHealth\(event\)/)
  assert.match(endpoint, /provider,/)
  assert.match(page, /Lock provider ready/)
  assert.match(page, /Lock provider degraded/)
})
