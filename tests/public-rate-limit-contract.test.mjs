import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('public mail and account endpoints enforce scoped rate limits', async () => {
  const paths = [
    'server/api/contact.post.ts',
    'server/api/auth/password-recovery.post.ts',
    'server/api/account/signup.post.ts',
    'server/api/account/signup-from-checkout.post.ts'
  ]

  for (const relativePath of paths) {
    const source = await readProjectFile(relativePath)
    assert.match(source, /enforceRateLimit\(event/)
  }

  const limiter = await readProjectFile('server/utils/security/rateLimit.ts')
  assert.match(limiter, /statusCode:\s*429/)
  assert.match(limiter, /Retry-After/)
  assert.match(limiter, /X-RateLimit-Remaining/)
})
