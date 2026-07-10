import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('member booking mode fails closed when membership cannot be loaded', async () => {
  const [book, preview, middleware] = await Promise.all([
    readProjectFile('app/pages/dashboard/book.vue'),
    readProjectFile('server/api/bookings/preview.get.ts'),
    readProjectFile('app/middleware/membership-required.ts')
  ])

  assert.match(book, /error: membershipError/)
  assert.match(book, /if \(error\) throw error/)
  assert.match(book, /Your account was not switched to guest pricing/)
  assert.match(book, /v-if="membershipResolved"[\s\S]*endpoint="\/api\/calendar\/member"/)
  assert.match(preview, /if \(membershipError\)[\s\S]*statusCode: 500/)
  assert.match(middleware, /reason=error/)
  assert.doesNotMatch(middleware, /\/memberships\?returnTo=.*reason=error/)
})

test('booking history includes future cancellations and hold actions require confirmation', async () => {
  const bookings = await readProjectFile('app/pages/dashboard/bookings.vue')

  assert.match(bookings, /\.or\(`end_time\.lte\.\$\{nowIso\.value\},status\.in\.\(canceled,cancelled\)`\)/)
  assert.match(bookings, /refreshUpcoming\(\),\s*refreshPast\(\),\s*refreshHoldSummary\(\)/)
  assert.match(bookings, /label: 'Cancel hold'[\s\S]*openCancelConfirm\(booking\)/)
  assert.match(bookings, /role="tablist"/)
  assert.match(bookings, /role="tabpanel"/)
  assert.match(bookings, /Booking history/)
})

test('member calendar and manual date controls remain practical and semantic', async () => {
  const [calendar, manualModal] = await Promise.all([
    readProjectFile('app/components/AvailabilityCalendar.vue'),
    readProjectFile('app/components/booking/ManualBookingTimeModal.vue')
  ])

  assert.match(calendar, /height: isGuestConstrainedFeed\.value \? 680 : 760/)
  assert.match(calendar, /scrollTime: calendarScrollTime\.value/)
  assert.match(calendar, /aria-label="Studio availability calendar"/)
  assert.match(manualModal, /aria-label="Show previous month"/)
  assert.match(manualModal, /aria-label="Show next month"/)
  assert.match(manualModal, /:aria-pressed="Boolean\(cell\?\.selected\)"/)
  assert.match(manualModal, />\s*Retry\s*</)
})

test('workshop eligibility requires both account approval and active membership', async () => {
  const [access, create, middleware] = await Promise.all([
    readProjectFile('server/api/workshops/access.get.ts'),
    readProjectFile('server/api/bookings/create.post.ts'),
    readProjectFile('app/middleware/membership-required.ts')
  ])

  assert.match(access, /const membershipEligible = isMembershipCurrentlyActive/)
  assert.match(access, /workshopBookingEnabled: accountEnabled && membershipEligible/)
  assert.match(create, /bookingKind === 'workshop' && !hasActiveMembership/)
  assert.match(create, /Workshop bookings require an active membership/)
  assert.match(middleware, /to\.path === '\/dashboard\/workshops'/)
})

test('saved cards require charge confirmation and negative balances stay visible', async () => {
  const [credits, book, workshops, profile] = await Promise.all([
    readProjectFile('app/pages/dashboard/credits.vue'),
    readProjectFile('app/pages/dashboard/book.vue'),
    readProjectFile('app/pages/dashboard/workshops.vue'),
    readProjectFile('app/pages/dashboard/profile.vue')
  ])

  assert.match(credits, /savedCardConfirmOpen\.value = true/)
  assert.match(credits, /Confirm saved-card charge/)
  assert.match(credits, /confirmSavedCardTopup/)
  assert.match(credits, /Credit balance below zero/)
  assert.match(book, /creditBalance\.value = Number\(data\?\.balance \?\? 0\)/)
  assert.match(workshops, /creditBalance\.value = Number\(data\?\.balance \?\? 0\)/)
  assert.doesNotMatch(book, /creditBalance\.value = Math\.max\(0/)
  assert.doesNotMatch(workshops, /creditBalance\.value = Math\.max\(0/)
  assert.match(book, /requestOwnBookingDestructiveAction\('cancel'\)/)
  assert.match(profile, /requestRemovePaymentMethod\(card\)/)
  assert.match(profile, /Remove saved card\?/)
})

test('manual, past-due, pending, and expired memberships have distinct presentations', async () => {
  const [membership, profile, dashboard] = await Promise.all([
    readProjectFile('app/pages/dashboard/membership.vue'),
    readProjectFile('app/pages/dashboard/profile.vue'),
    readProjectFile('app/pages/dashboard/index.vue')
  ])

  for (const source of [membership, profile]) {
    assert.match(source, /membership_source/)
    assert.match(source, /manual_expires_at/)
    assert.match(source, /Admin-assigned membership/)
  }
  assert.match(membership, /Membership payment is past due/)
  assert.match(membership, /Membership expired/)
  assert.match(dashboard, /Membership checkout incomplete/)
  assert.match(dashboard, /Membership payment is past due/)
  assert.match(dashboard, /Membership expired/)
})

test('member hold links resolve to the active-holds destination', async () => {
  const [home, book] = await Promise.all([
    readProjectFile('app/pages/dashboard/index.vue'),
    readProjectFile('app/pages/dashboard/book.vue')
  ])

  assert.match(home, /to="\/dashboard\/bookings\?tab=holds"/)
  assert.match(book, /router\.push\('\/dashboard\/bookings\?tab=holds'\)/)
  assert.doesNotMatch(`${home}\n${book}`, /dashboard\/membership#holds/)
})
