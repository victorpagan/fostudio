import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('promo upsert accepts Supabase timestamps with timezone offsets', async () => {
  const route = await readProjectFile('server/api/admin/promos.upsert.post.ts')

  assert.match(route, /startsAt: z\.string\(\)\.datetime\(\{ offset: true \}\)/)
  assert.match(route, /endsAt: z\.string\(\)\.datetime\(\{ offset: true \}\)/)
  assert.match(route, /bodySchema\.safeParse/)
  assert.match(route, /statusCode: 400/)
})

test('promo editor normalizes persisted date windows before saving', async () => {
  const page = await readProjectFile('app/pages/dashboard/admin/promos.vue')

  assert.match(page, /function normalizeIsoDate/)
  assert.match(page, /form\.startsAt = normalizeIsoDate\(promo\.starts_at\)/)
  assert.match(page, /form\.endsAt = normalizeIsoDate\(promo\.ends_at\)/)
})
