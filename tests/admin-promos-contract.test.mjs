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

test('featured public promotions are admin controlled and safely filtered', async () => {
  const [route, page, publicRoute] = await Promise.all([
    readProjectFile('server/api/admin/promos.upsert.post.ts'),
    readProjectFile('app/pages/dashboard/admin/promos.vue'),
    readProjectFile('server/api/site/important-bits.get.ts')
  ])

  assert.match(route, /featureOnHomepage: z\.boolean\(\)\.default\(false\)/)
  assert.match(route, /body\.featureOnHomepage && !body\.active/)
  assert.match(route, /feature_on_homepage: body\.featureOnHomepage/)
  assert.match(route, /contains\('metadata', \{ feature_on_homepage: true \}\)/)
  assert.match(page, /label="Feature on homepage \+ memberships"/)
  assert.match(page, /:disabled="!form\.active/)
  assert.match(publicRoute, /contains\('metadata', \{ feature_on_homepage: true \}\)/)
  assert.match(publicRoute, /!promo\.square_discount_id\?\.trim\(\)/)
  assert.match(publicRoute, /promo\.applies_to !== 'all' && promo\.applies_to !== 'membership'/)
})
