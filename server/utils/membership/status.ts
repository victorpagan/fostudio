export type MembershipStatusLike = {
  status?: string | null
  current_period_end?: string | null
  canceled_at?: string | null
}

function toTimeMs(value: string | null | undefined) {
  if (!value) return Number.NaN
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function isCurrentPeriod(row: MembershipStatusLike | null | undefined, nowMs = Date.now()) {
  const periodEndMs = toTimeMs(row?.current_period_end)
  return Number.isNaN(periodEndMs) || periodEndMs > nowMs
}

export function isMembershipCurrentlyActive(row: MembershipStatusLike | null | undefined, nowMs = Date.now()) {
  if ((row?.status ?? '').trim().toLowerCase() !== 'active') return false

  return isCurrentPeriod(row, nowMs)
}

export function hasCurrentMembershipEntitlement(row: MembershipStatusLike | null | undefined, nowMs = Date.now()) {
  const raw = (row?.status ?? '').trim().toLowerCase()
  if (raw !== 'active' && raw !== 'past_due') return false
  return isCurrentPeriod(row, nowMs)
}

export function resolveMembershipOperationalState(
  row: MembershipStatusLike | null | undefined,
  nowMs = Date.now()
) {
  const raw = (row?.status ?? '').trim().toLowerCase()
  if (!raw) return 'none'
  if (raw === 'past_due') {
    return hasCurrentMembershipEntitlement(row, nowMs) ? 'past_due' : 'inactive'
  }
  if (raw === 'active') {
    return isMembershipCurrentlyActive(row, nowMs)
      ? 'active'
      : row?.canceled_at ? 'canceled' : 'inactive'
  }
  return raw
}
