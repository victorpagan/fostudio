import { analyticsAccountClassification } from '../../config/account-classification'
import { toBool, toStringOrNull } from './parse'
import type { AccountClassification } from './types'

type CustomerClassificationRow = {
  id: string
  user_id: string | null
  email: string | null
  is_test_account?: boolean | null
  is_internal_account?: boolean | null
  exclude_from_kpis?: boolean | null
  expires_at?: string | null
}

type CustomerLookup = {
  byCustomerId: Map<string, CustomerClassificationRow>
  byUserId: Map<string, CustomerClassificationRow>
}

type ResolveInput = {
  customerId?: string | null
  userId?: string | null
  email?: string | null
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized || null
}

function toDomain(email: string | null) {
  if (!email || !email.includes('@')) return null
  return email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase() || null
}

function parseExpiresAt(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString()
}

function isExpiryActive(expiresAt: string | null) {
  if (!expiresAt) return true
  const parsed = Date.parse(expiresAt)
  if (Number.isNaN(parsed)) return true
  return parsed > Date.now()
}

function inferFromEmail(email: string | null) {
  const domain = toDomain(email)
  const local = email?.split('@')[0] ?? ''

  const domainIsInternal = domain
    ? analyticsAccountClassification.internalEmailDomains.some(item => domain === item.toLowerCase())
    : false

  const domainIsTest = domain
    ? analyticsAccountClassification.testEmailDomains.some(item => domain === item.toLowerCase())
    : false

  const markerIsTest = analyticsAccountClassification.testEmailMarkers
    .some(marker => local.includes(marker.toLowerCase()))

  const prefixIsInternal = analyticsAccountClassification.internalEmailPrefixes
    .some(prefix => (email ?? '').startsWith(prefix.toLowerCase()))

  return {
    is_test_account: domainIsTest || markerIsTest,
    is_internal_account: domainIsInternal || prefixIsInternal
  }
}

function coerceRowValue(row: CustomerClassificationRow | null) {
  const email = normalizeEmail(row?.email ?? null)
  const inferred = inferFromEmail(email)

  const is_test_account = toBool(row?.is_test_account, inferred.is_test_account)
  const is_internal_account = toBool(row?.is_internal_account, inferred.is_internal_account)
  const explicitExclude = toBool(row?.exclude_from_kpis, false)
  const expires_at = parseExpiresAt(toStringOrNull(row?.expires_at))

  const shouldExclude = explicitExclude
    || (analyticsAccountClassification.excludeTestByDefault && is_test_account)
    || (analyticsAccountClassification.excludeInternalByDefault && is_internal_account)

  return {
    account_email: email,
    is_test_account,
    is_internal_account,
    exclude_from_kpis: shouldExclude && isExpiryActive(expires_at),
    expires_at
  }
}

export function buildCustomerLookup(rows: CustomerClassificationRow[]) {
  const byCustomerId = new Map<string, CustomerClassificationRow>()
  const byUserId = new Map<string, CustomerClassificationRow>()

  for (const row of rows) {
    const customerId = String(row.id ?? '').trim()
    if (customerId) byCustomerId.set(customerId, row)

    const userId = String(row.user_id ?? '').trim()
    if (userId && !byUserId.has(userId)) byUserId.set(userId, row)
  }

  return { byCustomerId, byUserId } satisfies CustomerLookup
}

export function resolveAccountClassification(input: ResolveInput, lookup: CustomerLookup) {
  const customerId = String(input.customerId ?? '').trim()
  const userId = String(input.userId ?? '').trim()
  const email = normalizeEmail(input.email ?? null)

  const matchedRow = (customerId ? lookup.byCustomerId.get(customerId) : null)
    ?? (userId ? lookup.byUserId.get(userId) : null)
    ?? null

  const fromRow = coerceRowValue(matchedRow)
  if (matchedRow) return fromRow

  const inferred = coerceRowValue({
    id: '',
    user_id: userId || null,
    email,
    is_test_account: null,
    is_internal_account: null,
    exclude_from_kpis: null,
    expires_at: null
  })

  return inferred
}

function isMissingColumnError(message: string) {
  return /column .* does not exist/i.test(message)
}

export async function fetchCustomerClassificationRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<CustomerClassificationRow[]> {
  const fullSelect = 'id,user_id,email,is_test_account,is_internal_account,exclude_from_kpis,expires_at'
  const fallbackSelect = 'id,user_id,email'

  const fullRes = await supabase
    .from('customers')
    .select(fullSelect)
    .limit(20000)

  if (!fullRes.error) {
    return (fullRes.data ?? []) as CustomerClassificationRow[]
  }

  if (!isMissingColumnError(fullRes.error.message ?? '')) {
    throw new Error(fullRes.error.message ?? 'Could not load customers for analytics classification')
  }

  const fallbackRes = await supabase
    .from('customers')
    .select(fallbackSelect)
    .limit(20000)

  if (fallbackRes.error) {
    throw new Error(fallbackRes.error.message ?? 'Could not load fallback customers for analytics classification')
  }

  return (fallbackRes.data ?? []) as CustomerClassificationRow[]
}

export function defaultAccountClassification(): AccountClassification {
  return {
    is_test_account: false,
    is_internal_account: false,
    exclude_from_kpis: false,
    expires_at: null
  }
}
