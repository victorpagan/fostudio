import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('availability calendar makes feed reliability explicit and gates selection on ready data', async () => {
  const calendar = await readProjectFile('app/components/AvailabilityCalendar.vue')

  assert.match(calendar, /type CalendarLoadState = 'loading' \| 'ready' \| 'stale' \| 'error'/)
  assert.match(calendar, /function isCalendarResponse/)
  assert.match(calendar, /loadState\.value = 'stale'/)
  assert.match(calendar, /loadState\.value = 'error'/)
  assert.match(calendar, /selectionEnabled = computed\(\(\) => canSelect\.value && loadState\.value === 'ready'\)/)
  assert.match(calendar, /selectable: selectionEnabled\.value/)
  assert.match(calendar, /Availability unavailable/)
  assert.match(calendar, /Last confirmed/)
  assert.match(calendar, />\s*Retry\s*</)
})

test('my bookings separates request errors from empty states and shows pending payments', async () => {
  const bookings = await readProjectFile('app/pages/dashboard/bookings.vue')

  assert.match(bookings, /\.in\('status', \['confirmed', 'requested', 'pending_payment'\]\)/)
  assert.match(bookings, /if \(normalized === 'pending_payment'\) return 'Pending payment'/)
  assert.match(bookings, /Payment has not completed\. Resume checkout/)
  assert.match(bookings, /resumePendingPayment/)
  assert.match(bookings, /show-retry/)

  const upcomingError = bookings.indexOf('v-else-if="upcomingError"')
  const upcomingEmpty = bookings.indexOf('v-else-if="!upcoming?.length"')
  const pastError = bookings.indexOf('v-else-if="pastError"')
  const pastEmpty = bookings.indexOf('v-else-if="!past?.length"')

  assert.ok(upcomingError >= 0 && upcomingError < upcomingEmpty)
  assert.ok(pastError >= 0 && pastError < pastEmpty)
})

test('my bookings defers cancellation capability and outcome details to the server', async () => {
  const bookings = await readProjectFile('app/pages/dashboard/bookings.vue')

  assert.match(bookings, /function canRequestCancellation/)
  assert.match(bookings, /Cancellation eligibility and any credit return will be confirmed/)
  assert.match(bookings, /description: getApiErrorMessage\(error/)
  assert.match(bookings, /result\.eligible_for_refund/)
  assert.doesNotMatch(bookings, /hoursUntilStart\(booking\) >= 24/)
  assert.doesNotMatch(bookings, /Cancellation is outside 24h/)
})
