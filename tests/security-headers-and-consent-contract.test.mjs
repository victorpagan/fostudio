import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('production responses define baseline security headers', async () => {
  const config = await readProjectFile('nuxt.config.ts')
  assert.match(config, /Content-Security-Policy/)
  assert.match(config, /Strict-Transport-Security/)
  assert.match(config, /X-Content-Type-Options/)
  assert.match(config, /Referrer-Policy/)
  assert.match(config, /Permissions-Policy/)
})

test('Google Ads loads only after explicit consent and opt-out persists', async () => {
  const app = await readProjectFile('app/app.vue')
  const layout = await readProjectFile('app/layouts/default.vue')
  const footer = await readProjectFile('app/components/AppFooter.vue')

  assert.match(app, /cookieConsent\.value === 'accepted'/)
  assert.match(layout, /cookieConsent\.value = 'rejected'/)
  assert.match(footer, /Privacy choices/)
})
