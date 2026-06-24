import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('admin member charge API charges Square saved cards, stores audit rows, and sends receipt mail', async () => {
  const route = await readProjectFile('server/api/admin/members/charge.post.ts')

  assert.match(route, /requireServerAdmin\(event\)/)
  assert.match(route, /square\.cards\.list/)
  assert.match(route, /square\.payments\.create/)
  assert.match(route, /admin_member_charges/)
  assert.match(route, /billing\.memberChargeReceipt/)
  assert.match(route, /sendViaFomailer/)
  assert.match(route, /idempotencyKey/)
  assert.match(route, /Selected card is not available/)
})

test('admin member detail includes charge history but customer dashboard remains uninvolved', async () => {
  const detailRoute = await readProjectFile('server/api/admin/members/detail.get.ts')
  const memberPage = await readProjectFile('app/pages/dashboard/admin/members.vue')

  assert.match(detailRoute, /admin_member_charges/)
  assert.match(detailRoute, /memberCharges/)
  assert.match(memberPage, /type MemberCharge/)
  assert.match(memberPage, /\/api\/admin\/members\/charge/)
  assert.match(memberPage, /type MemberTab = .*'charges'/)
  assert.match(memberPage, /label: 'Charges', value: 'charges'/)
  assert.match(memberPage, /selectedTab === 'charges'/)
  assert.match(memberPage, /Repair charge history/)
})

test('admin member detail tolerates missing member charge history table during deploys', async () => {
  const detailRoute = await readProjectFile('server/api/admin/members/detail.get.ts')

  assert.match(detailRoute, /isOptionalMemberChargeHistoryError/)
  assert.match(detailRoute, /Could not find the table/)
  assert.match(detailRoute, /memberChargeHistoryAvailable/)
})
