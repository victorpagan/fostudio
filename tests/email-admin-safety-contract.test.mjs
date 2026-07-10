import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('email registry writes are patch-based and deletions must be explicit', async () => {
  const endpoint = await readProjectFile('server/api/admin/email/settings.upsert.post.ts')
  const page = await readProjectFile('app/pages/dashboard/admin/email.vue')

  assert.match(endpoint, /deleteEventTypes/)
  assert.doesNotMatch(endpoint, /existingTemplatesRaw/)
  assert.match(page, /saveAdminCopySettings/)
  assert.match(page, /settingsLoadState === 'error'/)
  assert.match(page, /templateDraftDirty/)
})

test('registry tests send the current draft rather than silently reloading saved copy', async () => {
  const endpoint = await readProjectFile('server/api/admin/email/test.post.ts')
  const page = await readProjectFile('app/pages/dashboard/admin/email.vue')

  assert.match(endpoint, /templateDraft/)
  assert.match(endpoint, /testedDraft/)
  assert.match(page, /templateDraft:\s*\{/)
})

test('campaign navigation flushes autosave and uses one explicit audience mode', async () => {
  const page = await readProjectFile('app/pages/dashboard/admin/email-campaigns.vue')

  assert.match(page, /flushPendingCampaignSave/)
  assert.match(page, /onBeforeRouteLeave/)
  assert.match(page, /Audience source/)
  assert.doesNotMatch(page, /alternativeRecipientsOnly/)
})
