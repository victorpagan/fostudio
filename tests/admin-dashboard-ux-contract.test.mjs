import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

async function collectVueFiles(directory) {
  const absoluteDirectory = path.join(rootDir, directory)
  const entries = await readdir(absoluteDirectory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectVueFiles(relativePath)
    return entry.isFile() && entry.name.endsWith('.vue') ? [relativePath] : []
  }))
  return files.flat()
}

test('admin settings load live values before enabling mutations', async () => {
  const settingsPages = [
    'app/pages/dashboard/admin/google-calendar.vue',
    'app/pages/dashboard/admin/holds.vue',
    'app/pages/dashboard/admin/calendar.vue'
  ]

  for (const pagePath of settingsPages) {
    const page = await readProjectFile(pagePath)
    assert.match(page, /onMounted\(/, `${pagePath} must load on mount`)
    assert.match(page, /settingsReady/, `${pagePath} must expose a fail-closed ready state`)
    assert.match(page, /loadError/, `${pagePath} must surface load failures`)
  }

  const waiverPage = await readProjectFile('app/pages/dashboard/admin/waiver.vue')
  assert.match(waiverPage, /onMounted\(/)
  assert.match(waiverPage, /templatesReady/)
  assert.match(waiverPage, /loadError/)
})

test('subscription administration supports safe confirmation and keyboard reordering', async () => {
  const page = await readProjectFile('app/pages/dashboard/admin/subscriptions.vue')

  assert.match(page, /tierLoadError/)
  assert.match(page, /tiersReady/)
  assert.match(page, /moveTier/)
  assert.match(page, /<ConfirmDialog/)
  assert.doesNotMatch(page, /window\.confirm/)
})

test('analytics pages share one shell and chart bars expose period labels', async () => {
  const pages = ['index', 'alerts', 'metrics', 'report', 'trends', 'integrations']

  for (const pageName of pages) {
    const page = await readProjectFile(`app/pages/dashboard/admin/analytics/${pageName}.vue`)
    assert.match(page, /<AdminAnalyticsPage/)
  }

  const trendsPage = await readProjectFile('app/pages/dashboard/admin/analytics/trends.vue')
  assert.match(trendsPage, /role="img"/)
  assert.match(trendsPage, /aria-label=/)
})

test('dead access jobs require an audited, conditional admin retry', async () => {
  const endpoint = await readProjectFile('server/api/admin/access/jobs.retry.post.ts')

  assert.match(endpoint, /requireServerAdmin/)
  assert.match(endpoint, /reason:\s*z\.string\(\)\.trim\(\)\.min\(3\)/)
  assert.match(endpoint, /existing\.status !== 'dead'/)
  assert.match(endpoint, /manualRetry/)
  assert.match(endpoint, /\.eq\('status', 'dead'\)/)
})

test('authenticated booking consumes the public calendar selection handoff', async () => {
  const page = await readProjectFile('app/pages/dashboard/book.vue')

  assert.match(page, /route\.query\.start/)
  assert.match(page, /route\.query\.end/)
  assert.match(page, /route\.query\.rateKind/)
  assert.match(page, /delete nextQuery\.start/)
  assert.match(page, /router\.replace\(\{ query: nextQuery \}\)/)
})

test('shared alerts, modal labels, and confirmation dialogs remain accessible', async () => {
  const vueFiles = await collectVueFiles('app')

  for (const filePath of vueFiles) {
    const source = await readProjectFile(filePath)
    if (filePath !== 'app/components/AppAlert.vue') {
      assert.doesNotMatch(source, /<UAlert\b/, `${filePath} must use AppAlert for live-region semantics`)
    }
    assert.doesNotMatch(source, /window\.confirm\(/, `${filePath} must use ConfirmDialog`)

    for (const modalTag of source.matchAll(/<UModal\b[\s\S]*?>/g)) {
      assert.match(
        modalTag[0],
        /(?:^|\s)(?::)?title=/,
        `${filePath} has an unlabeled UModal: ${modalTag[0].replaceAll(/\s+/g, ' ')}`
      )
    }
  }
})
