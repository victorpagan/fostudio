type JsonLike = Record<string, unknown> | null | undefined

export type MembershipCheckoutRevenueSession = {
  id: string
  paid_at: string | null
  plan_variation_id: string | null
  tier: string | null
  cadence: string | null
  claimed_by_user_id: string | null
  customer_id?: string | null
  claimed_membership_id?: string | null
  status?: string | null
  metadata?: JsonLike
}

export type MembershipVariationPriceRow = {
  id: string
  tier_id: string | null
  cadence: string | null
  provider_plan_variation_id?: string | null
  price_cents: number | null
}

export type MembershipRevenueResolution = {
  sessionId: string
  paidAt: string
  userId: string | null
  customerId: string | null
  tier: string | null
  cadence: string | null
  amountCents: number
}

export type MembershipRevenueResolutionResult = {
  rows: MembershipRevenueResolution[]
  stats: {
    inputSessions: number
    includedSessions: number
    droppedByStatus: number
    droppedByMetadataExclude: number
    droppedByDeduplication: number
    droppedByMissingAmount: number
  }
}

type VariationLookup = {
  byInternalId: Map<string, number>
  byProviderVariationId: Map<string, number>
  byTierCadence: Map<string, number>
}

function asBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return false
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return false
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readMetadataAmountCents(metadata: JsonLike) {
  const paymentAmount = toNumber(metadata?.payment_amount_cents)
  if (paymentAmount !== null && paymentAmount >= 0) return Math.floor(paymentAmount)

  const effectiveAmount = toNumber(metadata?.effective_price_cents)
  if (effectiveAmount !== null && effectiveAmount >= 0) return Math.floor(effectiveAmount)

  return null
}

function isSessionRevenueExcluded(metadata: JsonLike) {
  return asBoolean(metadata?.analytics_exclude)
    || asBoolean(metadata?.revenue_excluded)
    || asBoolean(metadata?.exclude_from_revenue)
}

function shouldIncludeStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (!normalized) return true
  return normalized === 'claimed' || normalized === 'completed'
}

function buildVariationLookup(rows: MembershipVariationPriceRow[]): VariationLookup {
  const byInternalId = new Map<string, number>()
  const byProviderVariationId = new Map<string, number>()
  const byTierCadence = new Map<string, number>()

  for (const row of rows) {
    const cents = Math.max(0, Math.floor(Number(row.price_cents ?? 0)))
    if (!Number.isFinite(cents)) continue

    const id = String(row.id ?? '').trim()
    if (id) byInternalId.set(id, cents)

    const providerId = String(row.provider_plan_variation_id ?? '').trim()
    if (providerId) byProviderVariationId.set(providerId, cents)

    const tier = String(row.tier_id ?? '').trim().toLowerCase()
    const cadence = String(row.cadence ?? '').trim().toLowerCase()
    const pairKey = `${tier}:${cadence}`
    if (tier && cadence && !byTierCadence.has(pairKey)) {
      byTierCadence.set(pairKey, cents)
    }
  }

  return {
    byInternalId,
    byProviderVariationId,
    byTierCadence
  }
}

function resolveSessionAmountCents(
  session: MembershipCheckoutRevenueSession,
  lookup: VariationLookup
) {
  const metadataAmount = readMetadataAmountCents(session.metadata)
  if (metadataAmount !== null) return metadataAmount

  const planVariationId = String(session.plan_variation_id ?? '').trim()
  if (planVariationId) {
    const byInternal = lookup.byInternalId.get(planVariationId)
    if (typeof byInternal === 'number') return byInternal

    const byProvider = lookup.byProviderVariationId.get(planVariationId)
    if (typeof byProvider === 'number') return byProvider
  }

  const tier = String(session.tier ?? '').trim().toLowerCase()
  const cadence = String(session.cadence ?? '').trim().toLowerCase()
  const byPair = lookup.byTierCadence.get(`${tier}:${cadence}`)
  if (typeof byPair === 'number') return byPair

  return null
}

function toMs(iso: string | null | undefined) {
  if (!iso) return Number.NaN
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function dedupeSessionsByClaimedMembership(
  sessions: MembershipCheckoutRevenueSession[],
  windowHours: number
) {
  const windowMs = Math.max(1, windowHours) * 60 * 60 * 1000
  const passthrough: MembershipCheckoutRevenueSession[] = []
  const grouped = new Map<string, MembershipCheckoutRevenueSession[]>()

  for (const session of sessions) {
    const membershipId = String(session.claimed_membership_id ?? '').trim()
    if (!membershipId) {
      passthrough.push(session)
      continue
    }

    const rows = grouped.get(membershipId) ?? []
    rows.push(session)
    grouped.set(membershipId, rows)
  }

  const deduped: MembershipCheckoutRevenueSession[] = []
  let dropped = 0

  for (const rows of grouped.values()) {
    rows.sort((left, right) => toMs(left.paid_at) - toMs(right.paid_at))
    if (rows.length <= 1) {
      deduped.push(...rows)
      continue
    }

    let cluster: MembershipCheckoutRevenueSession[] = []

    const flushCluster = () => {
      if (cluster.length === 0) return
      cluster.sort((left, right) => toMs(left.paid_at) - toMs(right.paid_at))
      const keep = cluster[cluster.length - 1]
      if (keep) deduped.push(keep)
      if (cluster.length > 1) dropped += cluster.length - 1
      cluster = []
    }

    for (const row of rows) {
      if (cluster.length === 0) {
        cluster.push(row)
        continue
      }

      const prev = cluster[cluster.length - 1]
      const prevMs = toMs(prev?.paid_at)
      const currentMs = toMs(row.paid_at)
      if (Number.isFinite(prevMs) && Number.isFinite(currentMs) && (currentMs - prevMs) <= windowMs) {
        cluster.push(row)
        continue
      }

      flushCluster()
      cluster.push(row)
    }

    flushCluster()
  }

  return {
    rows: [...passthrough, ...deduped].sort((left, right) => toMs(left.paid_at) - toMs(right.paid_at)),
    droppedCount: dropped
  }
}

export function resolveMembershipCheckoutRevenue(
  sessions: MembershipCheckoutRevenueSession[],
  variations: MembershipVariationPriceRow[],
  options?: {
    dedupeWindowHours?: number
  }
): MembershipRevenueResolutionResult {
  const inputSessions = sessions.length
  let droppedByStatus = 0
  let droppedByMetadataExclude = 0
  let droppedByMissingAmount = 0
  const dedupeWindowHours = options?.dedupeWindowHours ?? 36

  const eligible = sessions.filter((session) => {
    if (!session.paid_at) return false

    if (!shouldIncludeStatus(session.status)) {
      droppedByStatus += 1
      return false
    }

    if (isSessionRevenueExcluded(session.metadata)) {
      droppedByMetadataExclude += 1
      return false
    }

    return true
  })

  const deduped = dedupeSessionsByClaimedMembership(eligible, dedupeWindowHours)
  const lookup = buildVariationLookup(variations)
  const rows: MembershipRevenueResolution[] = []

  for (const session of deduped.rows) {
    const amountCents = resolveSessionAmountCents(session, lookup)
    if (amountCents === null || amountCents <= 0) {
      droppedByMissingAmount += 1
      continue
    }

    rows.push({
      sessionId: String(session.id ?? ''),
      paidAt: String(session.paid_at),
      userId: session.claimed_by_user_id ? String(session.claimed_by_user_id) : null,
      customerId: session.customer_id ? String(session.customer_id) : null,
      tier: session.tier ? String(session.tier) : null,
      cadence: session.cadence ? String(session.cadence) : null,
      amountCents
    })
  }

  return {
    rows,
    stats: {
      inputSessions,
      includedSessions: rows.length,
      droppedByStatus,
      droppedByMetadataExclude,
      droppedByDeduplication: deduped.droppedCount,
      droppedByMissingAmount
    }
  }
}
