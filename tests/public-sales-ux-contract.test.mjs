import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('public calendar tolerates partial CMS content and preserves booking intent', async () => {
  const publicCalendar = await readProjectFile('app/pages/calendar.vue')
  const memberBooking = await readProjectFile('app/pages/dashboard/book.vue')

  assert.match(publicCalendar, /source\?\.readingPanel \?\? fallbackContent\.readingPanel/)
  assert.match(publicCalendar, /source\?\.nextMovePanel \?\? fallbackContent\.nextMovePanel/)
  assert.doesNotMatch(publicCalendar, /resolved\.readingPanel\.points/)
  assert.match(publicCalendar, /start:\s*selectedTime\.value\.start\.toISOString\(\)/)
  assert.match(publicCalendar, /returnTo/)
  assert.match(memberBooking, /route\.query\.start/)
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

test('public pages define canonical SEO and customer-safe guest conversion paths', async () => {
  const seo = await readProjectFile('app/composables/usePublicSeo.ts')
  const home = await readProjectFile('app/pages/index.vue')
  const memberships = await readProjectFile('app/pages/memberships.vue')
  const signup = await readProjectFile('app/pages/signup.vue')

  assert.match(seo, /canonical/)
  assert.match(seo, /application\/ld\+json/)
  assert.match(home, /guest/i)
  assert.match(memberships, /guest/i)
  assert.match(signup, /useNoindexSeo/)
  assert.match(seo, /noindex,nofollow,noarchive/)
})
