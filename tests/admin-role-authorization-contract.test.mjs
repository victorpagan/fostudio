import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('admin authorization trusts protected app metadata only', async () => {
  const serverAuth = await readProjectFile('server/utils/auth.ts')
  const currentUser = await readProjectFile('app/composables/use-current-user.ts')
  const membershipGuard = await readProjectFile('app/middleware/membership-required.ts')

  for (const source of [serverAuth, currentUser, membershipGuard]) {
    assert.doesNotMatch(source, /user_metadata\?\.role/)
    assert.match(source, /app_metadata\?\.user_role/)
    assert.match(source, /app_metadata\?\.role/)
  }
})
