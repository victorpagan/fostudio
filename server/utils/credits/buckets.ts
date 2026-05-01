import { isMembershipCurrentlyActive } from '~~/server/utils/membership/status'

export type CreditLedgerBucketRow = {
  id: string
  delta: number | string
  reason: string | null
  expires_at: string | null
  created_at: string | null
}

type CreditLot = {
  bucket: 'bank' | 'topoff'
  remaining: number
  expiresAtMs: number | null
  createdAtMs: number
}

export type CreditBucketSummary = {
  bankBalance: number
  topoffBalance: number
  totalBalance: number
  expiringSoonCredits: number
  expiringSoonAt: string | null
}

export const DEFAULT_MEMBERSHIP_CREDIT_EXPIRY_DAYS = 90
export const DEFAULT_TOPUP_CREDIT_EXPIRY_DAYS = 30
export const DEFAULT_GUEST_CREDIT_EXPIRY_DAYS = 30

function asNumber(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function parseMs(value: string | null | undefined) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

function nextLotIndex(lots: CreditLot[]) {
  let bestIdx = -1
  for (let idx = 0; idx < lots.length; idx += 1) {
    const lot = lots[idx]
    if (!lot || lot.remaining <= 0) continue

    if (bestIdx < 0) {
      bestIdx = idx
      continue
    }

    const best = lots[bestIdx]!
    const lotExpiry = lot.expiresAtMs === null ? Number.POSITIVE_INFINITY : lot.expiresAtMs
    const bestExpiry = best.expiresAtMs === null ? Number.POSITIVE_INFINITY : best.expiresAtMs
    if (lotExpiry < bestExpiry) {
      bestIdx = idx
      continue
    }
    if (lotExpiry === bestExpiry && lot.createdAtMs < best.createdAtMs) {
      bestIdx = idx
    }
  }
  return bestIdx
}

export function computeCreditBucketSummary(
  rows: CreditLedgerBucketRow[],
  nowMs = Date.now(),
  expiringSoonWindowDays = 7
): CreditBucketSummary {
  const activeRows = rows
    .filter((row) => {
      const expiresAtMs = parseMs(row.expires_at)
      return expiresAtMs === null || expiresAtMs > nowMs
    })
    .sort((left, right) => {
      const leftCreated = parseMs(left.created_at) ?? 0
      const rightCreated = parseMs(right.created_at) ?? 0
      if (leftCreated !== rightCreated) return leftCreated - rightCreated
      return left.id.localeCompare(right.id)
    })

  const lots: CreditLot[] = []
  let bankDebt = 0

  for (const row of activeRows) {
    const delta = asNumber(row.delta)
    if (delta > 0) {
      lots.push({
        bucket: (row.reason ?? '').toLowerCase() === 'topoff' ? 'topoff' : 'bank',
        remaining: delta,
        expiresAtMs: parseMs(row.expires_at),
        createdAtMs: parseMs(row.created_at) ?? nowMs
      })
      continue
    }

    if (delta >= 0) continue
    let remainingBurn = Math.abs(delta)
    while (remainingBurn > 0) {
      const idx = nextLotIndex(lots)
      if (idx < 0) {
        bankDebt += remainingBurn
        remainingBurn = 0
        break
      }

      const lot = lots[idx]!
      const consumed = Math.min(remainingBurn, lot.remaining)
      lot.remaining -= consumed
      remainingBurn -= consumed
    }
  }

  let bankBalance = 0
  let topoffBalance = 0
  let expiringSoonCredits = 0
  let expiringSoonAtMs: number | null = null
  const expiringSoonCutoffMs = nowMs + Math.max(1, expiringSoonWindowDays) * 24 * 60 * 60 * 1000

  for (const lot of lots) {
    if (lot.remaining <= 0) continue
    if (lot.bucket === 'topoff') topoffBalance += lot.remaining
    else bankBalance += lot.remaining

    if (lot.expiresAtMs !== null && lot.expiresAtMs > nowMs && lot.expiresAtMs <= expiringSoonCutoffMs) {
      expiringSoonCredits += lot.remaining
      expiringSoonAtMs = expiringSoonAtMs === null
        ? lot.expiresAtMs
        : Math.min(expiringSoonAtMs, lot.expiresAtMs)
    }
  }

  if (bankDebt > 0) bankBalance -= bankDebt

  return {
    bankBalance: Number(bankBalance.toFixed(2)),
    topoffBalance: Number(topoffBalance.toFixed(2)),
    totalBalance: Number((bankBalance + topoffBalance).toFixed(2)),
    expiringSoonCredits: Number(expiringSoonCredits.toFixed(2)),
    expiringSoonAt: expiringSoonAtMs === null ? null : new Date(expiringSoonAtMs).toISOString()
  }
}

export async function resolveTopoffCreditExpiryDays(
  supabase: unknown,
  userId: string,
  membershipId: string | null | undefined
) {
  type QueryResult<T = Record<string, unknown>> = {
    data?: T[] | null
    error?: { message: string } | null
  }
  type SingleResult<T = Record<string, unknown>> = {
    data?: T | null
    error?: { message: string } | null
  }
  type QueryBuilder<T = Record<string, unknown>> = PromiseLike<QueryResult<T>> & {
    eq: (column: string, value: unknown) => QueryBuilder<T>
    maybeSingle: () => PromiseLike<SingleResult<T>>
    select: (columns?: string, options?: Record<string, unknown>) => QueryBuilder<T>
  }
  const db = supabase as { from: <T = Record<string, unknown>>(table: string) => QueryBuilder<T> }
  let tierId: string | null = null
  const trimmedMembershipId = typeof membershipId === 'string' && membershipId.trim()
    ? membershipId.trim()
    : null

  if (trimmedMembershipId) {
    const { data } = await db
      .from<{ tier: string | null, status: string | null, current_period_end: string | null, canceled_at: string | null }>('memberships')
      .select('tier,status,current_period_end,canceled_at')
      .eq('id', trimmedMembershipId)
      .maybeSingle()
    tierId = isMembershipCurrentlyActive(data) && typeof data?.tier === 'string' ? data.tier : null
  }

  if (!tierId) {
    const { data } = await db
      .from<{ tier: string | null, status: string | null, current_period_end: string | null, canceled_at: string | null }>('memberships')
      .select('tier,status,current_period_end,canceled_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (isMembershipCurrentlyActive(data) && typeof data?.tier === 'string') {
      tierId = data.tier
    }
  }

  if (!tierId) {
    const { data: configRow } = await db
      .from<{ value: string | number | null }>('system_config')
      .select('value')
      .eq('key', 'guest_credit_expiry_days')
      .maybeSingle()
    const parsed = Number(configRow?.value ?? DEFAULT_GUEST_CREDIT_EXPIRY_DAYS)
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_GUEST_CREDIT_EXPIRY_DAYS
  }

  const { data: tierRow } = await db
    .from<{ topoff_credit_expiry_days?: number | string | null }>('membership_tiers')
    .select('topoff_credit_expiry_days')
    .eq('id', tierId)
    .maybeSingle()

  const parsed = Number(tierRow?.topoff_credit_expiry_days ?? DEFAULT_TOPUP_CREDIT_EXPIRY_DAYS)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_TOPUP_CREDIT_EXPIRY_DAYS
  return Math.floor(parsed)
}

export function buildExpiryIsoFromDays(days: number, baseMs = Date.now()) {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_TOPUP_CREDIT_EXPIRY_DAYS
  return new Date(baseMs + safeDays * 24 * 60 * 60 * 1000).toISOString()
}
