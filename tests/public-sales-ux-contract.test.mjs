import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('public calendar tolerates partial CMS content and keeps the guest signup path', async () => {
  const publicCalendar = await readProjectFile('app/pages/calendar.vue')

  assert.match(publicCalendar, /source\?\.nextMovePanel \?\? fallbackContent\.nextMovePanel/)
  assert.doesNotMatch(publicCalendar, /content\.readingPanel/)
  assert.doesNotMatch(publicCalendar, /Reading the calendar/)
  assert.match(publicCalendar, /calendar-guide-grid--single/)
  assert.match(publicCalendar, /\/signup\?returnTo=\/dashboard\/book/)
})

test('guest policy fallbacks agree on the current 9 AM to 9 PM window', async () => {
  const guestPolicy = await readProjectFile('server/utils/booking/guestPolicy.ts')
  const adminSettings = await readProjectFile('server/api/admin/calendar/settings.get.ts')
  const memberBooking = await readProjectFile('app/pages/dashboard/book.vue')

  assert.match(guestPolicy, /startHour:\s*9/)
  assert.match(guestPolicy, /endHour:\s*21/)
  assert.match(adminSettings, /guestBookingStartHour:\s*Number\([^\n]+\?\? 9\)/)
  assert.match(adminSettings, /guestBookingEndHour:\s*Number\([^\n]+\?\? 21\)/)
  assert.match(memberBooking, /guestBookingStartHour \?\? 9/)
  assert.match(memberBooking, /guestBookingEndHour \?\? 21/)
})

test('public pages retain the approved marketing prose and original landing hero', async () => {
  const seo = await readProjectFile('app/composables/usePublicSeo.ts')
  const home = await readProjectFile('app/pages/index.vue')
  const landing = await readProjectFile('content/site/landing.yml')
  const membershipsPage = await readProjectFile('app/pages/memberships.vue')
  const memberships = await readProjectFile('content/site/memberships.yml')
  const signup = await readProjectFile('app/pages/signup.vue')

  assert.match(seo, /canonical/)
  assert.match(landing, /kicker: Membership studio access/)
  assert.match(landing, /headline: Pick the studio membership that fits the way you actually work\./)
  assert.match(memberships, /Every membership includes studio equipment, backdrop paper, and day-to-day consumables\./)
  assert.doesNotMatch(membershipsPage, /Credit-based studio booking for real production workflows\./)
  assert.doesNotMatch(membershipsPage, /Each plan mints monthly credits\./)
  assert.match(home, /\(Image taken in our studio!\)/)
  assert.doesNotMatch(home, /Los Angeles photo studio memberships/)
  assert.doesNotMatch(home, /absolute left-3 top-16/)
  assert.match(signup, /useNoindexSeo/)
  assert.match(seo, /noindex,nofollow,noarchive/)
})
