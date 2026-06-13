import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')

const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('fostudio exposes a public process health route', async () => {
  const contents = await readProjectFile('server/routes/health.get.ts')

  assert.match(contents, /service:\s*'fostudio'/)
  assert.match(contents, /state:\s*'up'/)
  assert.match(contents, /checkedAt/)
  assert.doesNotMatch(contents, /serverSupabase|SUPABASE|service_role|system_config/i)
})

test('fostudio exposes Supabase-backed readiness without leaking secrets', async () => {
  const contents = await readProjectFile('server/routes/ready.get.ts')

  assert.match(contents, /serverSupabaseServiceRole/)
  assert.match(contents, /system_config/)
  assert.match(contents, /name:\s*'supabase'/)
  assert.match(contents, /state:\s*ok\s*\?\s*'ready'\s*:\s*'down'/)
  assert.match(contents, /setResponseStatus\(event,\s*503\)/)
  assert.doesNotMatch(contents, /SERVICE_ROLE|SUPABASE_SERVICE|process\.env/i)
})
