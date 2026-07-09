import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('calendar GET routes are read-only and maintenance runs behind internal auth', async () => {
  const getRoutes = [
    'server/api/calendar/public.get.ts',
    'server/api/calendar/member.get.ts',
    'server/api/admin/calendar/bookings.get.ts'
  ]

  for (const relativePath of getRoutes) {
    const source = await readProjectFile(relativePath)
    assert.doesNotMatch(source, /maybeAutoSyncGoogleCalendar/)
    assert.doesNotMatch(source, /expireStalePendingGuestBookings/)
  }

  const maintenance = await readProjectFile('server/api/internal/calendar/maintenance.post.ts')
  assert.match(maintenance, /ACCESS_AUTOMATION_SHARED_KEY/)
  assert.match(maintenance, /expireStalePendingGuestBookings/)
  assert.match(maintenance, /maybeAutoSyncGoogleCalendar/)
})
