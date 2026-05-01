export type MembershipUiState = 'none' | 'active' | 'pending_checkout' | 'canceled' | 'past_due' | 'inactive'

type MembershipLike = {
  status?: string | null
  current_period_end?: string | null
  canceled_at?: string | null
}

function toTimeMs(value: string | null | undefined) {
  if (!value) return Number.NaN
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function resolveMembershipUiState(row: MembershipLike | null | undefined, nowMs = Date.now()): MembershipUiState {
  const raw = (row?.status ?? '').trim().toLowerCase()
  if (!raw) return 'none'
  if (raw === 'pending_checkout') return 'pending_checkout'
  if (raw === 'canceled') return 'canceled'

  if (raw === 'active' || raw === 'past_due') {
    const periodEndMs = toTimeMs(row?.current_period_end)
    if (!Number.isNaN(periodEndMs) && periodEndMs <= nowMs) {
      return row?.canceled_at ? 'canceled' : 'inactive'
    }
    return raw
  }

  return 'inactive'
}

export function hasActiveMembershipUi(row: MembershipLike | null | undefined, nowMs = Date.now()) {
  return resolveMembershipUiState(row, nowMs) === 'active'
}
