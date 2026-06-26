import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('app error reporting filters expected auth and static probe noise', async () => {
  const filter = await readProjectFile('server/utils/errors/filtering.ts')
  const plugin = await readProjectFile('server/plugins/app-error-reporting.ts')

  assert.match(filter, /shouldReportAppError/)
  assert.match(filter, /statusCode === 401 \|\| statusCode === 403/)
  assert.match(filter, /!pathname\.startsWith\('\/api\/internal\/'\)/)
  assert.match(filter, /isIgnorableNotFoundPath/)
  assert.match(filter, /_nuxt/)
  assert.match(filter, /wlwmanifest\\\.xml/)
  assert.match(filter, /xmlrpc\\\.php/)

  assert.match(plugin, /shouldReportAppError\(error, event\)/)
  assert.match(plugin, /if \(!shouldReportAppError\(error, event\)\) return/)
  assert.match(plugin, /statusCode: getErrorStatusCode\(error\)/)
})
