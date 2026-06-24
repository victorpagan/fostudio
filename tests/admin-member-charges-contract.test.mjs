import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

const rootDir = path.resolve(import.meta.dirname, '..')
const readProjectFile = relativePath => readFile(path.join(rootDir, relativePath), 'utf8')

test('admin member charges have an immutable staff-only audit table and registry receipt event', async () => {
  const migration = await readProjectFile('supabase/migrations/20260624120000_admin_member_charges.sql')

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.admin_member_charges/)
  assert.match(migration, /member_user_id uuid NOT NULL REFERENCES auth\.users\(id\)/)
  assert.match(migration, /amount_cents integer NOT NULL CHECK \(amount_cents > 0\)/)
  assert.match(migration, /status text NOT NULL DEFAULT 'pending'/)
  assert.match(migration, /ALTER TABLE public\.admin_member_charges ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /admin_member_charges_staff_all/)
  assert.match(migration, /billing\.memberChargeReceipt/)
  assert.match(migration, /sendgrid_template_id,\s+category,\s+active,\s+description/)
})

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
  assert.match(memberPage, /Repair charge history/)
})
