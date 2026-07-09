import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('booking creation persists rate metadata inside the burn transaction', async () => {
  const route = await readProjectFile('server/api/bookings/create.post.ts')

  assert.match(route, /create_confirmed_booking_with_burn_and_rate/)
  assert.match(route, /create_confirmed_booking_with_burn_no_membership_and_rate/)
  assert.match(route, /p_booking_rate_kind:\s*rateKind/)
  assert.match(route, /p_rate_policy_snapshot:\s*ratePolicySnapshot/)
  assert.doesNotMatch(route, /failed to persist booking rate metadata/)
})
