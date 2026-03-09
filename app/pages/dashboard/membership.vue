<script setup lang="ts">
import { getMembershipPlanDetails } from '~~/app/utils/membershipPlanDetails'
import { normalizeDiscountLabel } from '~~/app/utils/membershipDiscount'

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const route = useRoute()
const toast = useToast()

type MembershipRow = {
  id: string
  tier: string | null
  cadence: string | null
  status: string | null
  created_at: string | null
  current_period_end: string | null
  square_plan_variation_id: string | null
}

type TierRow = {
  display_name: string
  description: string | null
  booking_window_days: number | null
  peak_multiplier: number | null
  max_bank: number | null
  holds_included: number | null
}

type PlanVariation = {
  cadence: string
  credits_per_month: number | null
  price_cents: number | null
  currency: string | null
  discount_label: string | null
}

type LedgerRow = {
  id: string
  delta: number | string
  reason: string
  external_ref: string | null
  created_at: string
  metadata?: Record<string, unknown> | null
}

type CreditTopupOption = {
  id: string
  key: string
  label: string
  description: string | null
  credits: number
  basePriceCents: number
  effectivePriceCents: number
  salePriceCents: number | null
  saleActive: boolean
  saleStartsAt: string | null
  saleEndsAt: string | null
  sortOrder: number
  squareItemId: string | null
  squareVariationId: string | null
}

type HoldTopupOffer = {
  label: string
  holds: number
  amountCents: number
  currency: string
}

type HoldSummary = {
  holdsIncluded: number
  activeHolds: number
  holdsUsedThisCycle: number
  cycleStartIso: string | null
  cycleEndIso: string | null
  paidHoldBalance: number
  includedHoldsRemaining: number
  canRequestHoldNow: boolean
}

type CatalogTier = {
  id: string
  display_name: string
  description?: string | null
  booking_window_days: number
  peak_multiplier: number
  max_bank: number
  holds_included: number
  adminOnly?: boolean
  membership_plan_variations: PlanVariation[]
}

type SubscriptionState = {
  hasManagedSubscription: boolean
  currentPeriodEnd: string | null
  pendingSwap: {
    actionId: string | null
    effectiveDate: string | null
    target: {
      tier: string | null
      cadence: string | null
      displayName: string | null
    } | null
  } | null
  pendingCancel: {
    actionId: string | null
    effectiveDate: string | null
  } | null
}

type DoorCodeState = {
  doorCode: string | null
  doorCodeUpdatedAt: string | null
  canRequestChange: boolean
  cooldownEndsAt: string | null
  latestRequest: {
    id: string
    status: string | null
    requestedAt: string
    resolvedAt: string | null
  } | null
}

// ── Current membership ─────────────────────────────────────────────────────
const { data: membership, refresh } = await useAsyncData('dash:membership', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('id, tier, cadence, status, created_at, current_period_end, square_plan_variation_id')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as MembershipRow | null
})

const { data: tier, refresh: refreshTier } = await useAsyncData('dash:tier', async () => {
  if (!membership.value?.tier) return null
  const { data, error } = await supabase
    .from('membership_tiers')
    .select('display_name, description, booking_window_days, peak_multiplier, max_bank, holds_included')
    .eq('id', membership.value.tier)
    .maybeSingle()
  if (error) throw error
  return data as TierRow | null
}, { watch: [membership] })

const { data: variations, refresh: refreshVariations } = await useAsyncData('dash:variations', async () => {
  if (!membership.value?.tier) return []
  const { data, error } = await supabase
    .from('membership_plan_variations')
    .select('cadence, credits_per_month, price_cents, currency, discount_label')
    .eq('tier_id', membership.value.tier)
    .eq('provider', 'square')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as PlanVariation[]
}, { watch: [membership] })

function getDiscountLabel(label?: string | null) {
  return normalizeDiscountLabel(label)
}

// ── Tier catalog (shown when no active membership) ─────────────────────────
const membershipState = computed(() => {
  const s = (membership.value?.status ?? '').toLowerCase()
  if (s === 'active') return 'active'
  if (s === 'pending_checkout') return 'pending_checkout'
  if (s === 'canceled') return 'canceled'
  if (s === 'past_due') return 'past_due'
  if (!s) return 'none'
  return 'inactive'
})

const showCatalog = computed(() =>
  membershipState.value === 'none' || membershipState.value === 'inactive' || membershipState.value === 'canceled'
)
const hasActiveMembership = computed(() => membershipState.value === 'active')

const { data: balance, refresh: refreshBalance } = await useAsyncData('dash:membership:credits:balance', async () => {
  if (!user.value || !hasActiveMembership.value) return null
  const { data, error } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return asNumber(data?.balance)
}, { watch: [user, membershipState] })

const { data: ledger, refresh: refreshLedger } = await useAsyncData('dash:membership:credits:ledger', async () => {
  if (!user.value || !hasActiveMembership.value) return []
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('id,delta,reason,external_ref,created_at,metadata')
    .eq('user_id', user.value.sub)
    .order('created_at', { ascending: false })
    .limit(25)
  if (error) throw error
  return (data ?? []) as LedgerRow[]
}, { watch: [user, membershipState] })

const { data: tierCatalog } = await useAsyncData('dash:tierCatalog', async () => {
  const res = await $fetch<{ tiers: CatalogTier[] }>('/api/membership/catalog')
  return res?.tiers ?? []
}, { watch: [user] })

const catalogDetailsOpen = ref(false)
const catalogDetailsTierId = ref<string | null>(null)
const catalogDetailsTier = computed(() => {
  if (!catalogDetailsTierId.value) return null
  return (tierCatalog.value ?? []).find(tier => tier.id === catalogDetailsTierId.value) ?? null
})
const catalogDetails = computed(() => {
  if (!catalogDetailsTier.value) return null
  return getMembershipPlanDetails(catalogDetailsTier.value.id, catalogDetailsTier.value.display_name)
})

function openCatalogTierDetails(tierId: string) {
  catalogDetailsTierId.value = tierId
  catalogDetailsOpen.value = true
}

const { data: subscriptionState, refresh: refreshSubscriptionState } = await useAsyncData('dash:membership:subscription-state', async () => {
  if (!user.value || !hasActiveMembership.value) return null
  return await $fetch<SubscriptionState>('/api/membership/subscription-state')
}, { watch: [user, membershipState] })

const { data: topupOptions, refresh: refreshTopupOptions, pending: topupOptionsPending } = await useAsyncData('dash:membership:topup-options', async () => {
  if (!user.value || !hasActiveMembership.value) return []
  const res = await $fetch<{ options: CreditTopupOption[] }>('/api/credits/topup/options')
  return res?.options ?? []
}, { watch: [user, membershipState] })

const { data: holdSummary, refresh: refreshHoldSummary } = await useAsyncData('dash:membership:hold-summary', async () => {
  if (!user.value || !hasActiveMembership.value) return null
  return await $fetch<HoldSummary>('/api/holds/summary')
}, { watch: [user, membershipState] })

const { data: holdTopupOffer, refresh: refreshHoldTopupOffer } = await useAsyncData('dash:membership:hold-topup-offer', async () => {
  if (!user.value || !hasActiveMembership.value) return null
  const res = await $fetch<{ offer: HoldTopupOffer | null }>('/api/holds/topup/offer')
  return res.offer
}, { watch: [user, membershipState] })

const { data: doorCodeState, refresh: refreshDoorCodeState } = await useAsyncData('dash:membership:door-code', async () => {
  if (!user.value || !hasActiveMembership.value) return null
  return await $fetch<DoorCodeState>('/api/membership/door-code')
}, { watch: [user, membershipState] })

function goCheckout(tierId: string, cadence: string) {
  router.push(`/checkout?tier=${tierId}&cadence=${cadence}&returnTo=/dashboard/membership`)
}

function goMembershipSelector() {
  router.push('/dashboard/memberships')
}

function formatLedgerReason(reason: string) {
  switch ((reason || '').toLowerCase()) {
    case 'subscription_invoice_paid':
    case 'subscription_credit_grant':
      return 'Membership credits'
    case 'booking_burn':
      return 'Booking used'
    case 'topoff':
      return 'Credit top-up'
    case 'expiration':
      return 'Expired credits'
    case 'refund':
      return 'Refund'
    default:
      return reason
  }
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function formatDelta(value: number | string) {
  const n = asNumber(value)
  return n > 0 ? `+${n}` : `${n}`
}

function formatLedgerTitle(row: LedgerRow) {
  const reason = (row.reason || '').toLowerCase()
  if (reason === 'topoff') {
    const label = row.metadata?.option_label
    if (typeof label === 'string' && label.trim()) return label.trim()
  }
  return formatLedgerReason(row.reason)
}

// ── Formatting helpers ─────────────────────────────────────────────────────
const statusColor = computed(() => {
  switch (membershipState.value) {
    case 'active': return 'success'
    case 'pending_checkout': return 'warning'
    case 'past_due': return 'error'
    case 'canceled': return 'neutral'
    default: return 'neutral'
  }
})

const currentVariation = computed(() =>
  variations.value?.find(v => v.cadence === membership.value?.cadence) ?? null
)

function formatPrice(cents: number | null, currency = 'USD') {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function formatOptionUnit(option: CreditTopupOption) {
  const perCredit = option.effectivePriceCents / option.credits
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(perCredit / 100)
}

const dashboardHydrated = ref(false)

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

function fallbackDate(dt: Date) {
  return dt.toISOString().slice(0, 10)
}

function fallbackDateTime(dt: Date) {
  const iso = dt.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

function formatSaleWindow(start: string | null, end: string | null) {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const fromDate = parseDate(start)
  const toDate = parseDate(end)
  const from = fromDate
    ? (dashboardHydrated.value ? fromDate.toLocaleDateString('en-US', options) : fallbackDate(fromDate))
    : null
  const to = toDate
    ? (dashboardHydrated.value ? toDate.toLocaleDateString('en-US', options) : fallbackDate(toDate))
    : null

  if (from && to) return `${from} to ${to}`
  if (from) return `Starts ${from}`
  if (to) return `Ends ${to}`
  return null
}

function formatCadence(c: string | null) {
  switch (c) {
    case 'daily': return 'Daily'
    case 'weekly': return 'Weekly'
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly (3 months)'
    case 'annual': return 'Annual'
    default: return c ?? '—'
  }
}

function cadencePriceSuffix(cadence: string | null) {
  if (cadence === 'daily') return '/day'
  if (cadence === 'weekly') return '/week'
  if (cadence === 'monthly') return '/mo'
  if (cadence === 'quarterly') return '/quarter'
  if (cadence === 'annual') return '/year'
  return ''
}

function memberSince(createdAt: string | null) {
  if (!createdAt) return '—'
  const dt = parseDate(createdAt)
  if (!dt) return createdAt
  if (!dashboardHydrated.value) return dt.toISOString().slice(0, 7)
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatStatus(status: string | null | undefined) {
  return status || '—'
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return null
  const dt = parseDate(value)
  if (!dt) return null
  if (!dashboardHydrated.value) return fallbackDate(dt)
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatPeakCredits(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function formatLedgerTimestamp(value: string) {
  const dt = parseDate(value)
  if (!dt) return value
  if (!dashboardHydrated.value) return fallbackDateTime(dt)
  return dt.toLocaleString('en-US')
}

const topupLoadingKey = ref<string | null>(null)
const holdTopupLoading = ref(false)
const membershipCancelLoading = ref(false)
const membershipUndoCancelLoading = ref(false)
const doorCodeRequestLoading = ref(false)
const topupClaiming = ref(false)
const holdTopupClaiming = ref(false)
const topupOptionsTimedOut = ref(false)
const topupOptionsProgress = ref(0)
const TOPUP_OPTIONS_TIMEOUT_MS = 5000

let topupOptionsTimeoutHandle: ReturnType<typeof setTimeout> | null = null
let topupOptionsProgressHandle: ReturnType<typeof setInterval> | null = null

function clearTopupOptionsLoadTimers() {
  if (import.meta.server) return
  if (topupOptionsTimeoutHandle) {
    clearTimeout(topupOptionsTimeoutHandle)
    topupOptionsTimeoutHandle = null
  }
  if (topupOptionsProgressHandle) {
    clearInterval(topupOptionsProgressHandle)
    topupOptionsProgressHandle = null
  }
}

function startTopupOptionsLoadTimers() {
  if (import.meta.server) return
  clearTopupOptionsLoadTimers()
  topupOptionsTimedOut.value = false
  topupOptionsProgress.value = 8

  topupOptionsProgressHandle = setInterval(() => {
    topupOptionsProgress.value = Math.min(topupOptionsProgress.value + 6, 92)
  }, 220)

  topupOptionsTimeoutHandle = setTimeout(() => {
    topupOptionsTimedOut.value = true
    topupOptionsProgress.value = 100
    if (topupOptionsProgressHandle) {
      clearInterval(topupOptionsProgressHandle)
      topupOptionsProgressHandle = null
    }
  }, TOPUP_OPTIONS_TIMEOUT_MS)
}

watch([hasActiveMembership, topupOptionsPending], ([active, pending]) => {
  if (!dashboardHydrated.value) return

  if (!active) {
    clearTopupOptionsLoadTimers()
    topupOptionsTimedOut.value = false
    topupOptionsProgress.value = 0
    return
  }

  if (pending) {
    startTopupOptionsLoadTimers()
    return
  }

  clearTopupOptionsLoadTimers()
  if ((topupOptions.value?.length ?? 0) > 0) {
    topupOptionsTimedOut.value = false
    topupOptionsProgress.value = 100
  }
})

watch(topupOptions, (options) => {
  if ((options?.length ?? 0) > 0) {
    clearTopupOptionsLoadTimers()
    topupOptionsTimedOut.value = false
    topupOptionsProgress.value = 100
  }
})

async function refreshAll() {
  await Promise.all([
    refresh(),
    refreshTier(),
    refreshVariations(),
    refreshSubscriptionState(),
    refreshBalance(),
    refreshLedger(),
    refreshTopupOptions(),
    refreshHoldSummary(),
    refreshHoldTopupOffer(),
    refreshDoorCodeState()
  ])
}

async function requestDoorCodeChange() {
  if (doorCodeRequestLoading.value || !doorCodeState.value?.canRequestChange) return

  doorCodeRequestLoading.value = true
  try {
    await $fetch('/api/membership/door-code-request', { method: 'POST' })
    toast.add({
      title: 'Door code change requested',
      description: 'Your request was sent to the admin team for manual update.',
      color: 'success'
    })
    await refreshDoorCodeState()
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Could not request code change',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Unknown error',
      color: 'error'
    })
  } finally {
    doorCodeRequestLoading.value = false
  }
}

async function schedulePlanChange(tierId: string, cadence: string) {
  try {
    const res = await $fetch<{
      effectiveDate: string | null
      target: { displayName: string, cadence: string }
      message: string
    }>('/api/membership/change-plan', {
      method: 'POST',
      body: { tier: tierId, cadence }
    })
    const effective = formatDateLabel(res.effectiveDate) ?? 'your next billing cycle'
    toast.add({
      title: 'Plan change scheduled',
      description: `${res.target.displayName} (${formatCadence(res.target.cadence)}) starts ${effective}.`,
      color: 'success'
    })
    await refreshAll()
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Could not schedule plan change',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Unknown error',
      color: 'error'
    })
  }
}

async function cancelMembershipAtPeriodEnd() {
  if (membershipCancelLoading.value) return
  membershipCancelLoading.value = true
  try {
    const res = await $fetch<{ effectiveDate: string | null }>('/api/membership/cancel', {
      method: 'POST'
    })
    const effective = formatDateLabel(res.effectiveDate) ?? 'the end of your current billing cycle'
    toast.add({
      title: 'Cancellation scheduled',
      description: `Your membership remains active until ${effective}.`,
      color: 'warning'
    })
    await refreshAll()
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Could not schedule cancellation',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Unknown error',
      color: 'error'
    })
  } finally {
    membershipCancelLoading.value = false
  }
}

async function undoMembershipCancellation() {
  if (membershipUndoCancelLoading.value) return
  membershipUndoCancelLoading.value = true
  try {
    await $fetch('/api/membership/cancel-undo', { method: 'POST' })
    toast.add({
      title: 'Cancellation removed',
      description: 'Your membership will continue as normal.',
      color: 'success'
    })
    await refreshAll()
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Could not remove cancellation',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Unknown error',
      color: 'error'
    })
  } finally {
    membershipUndoCancelLoading.value = false
  }
}

async function startTopup(optionKey: string) {
  topupLoadingKey.value = optionKey
  try {
    const res = await $fetch<{ redirectUrl: string }>('/api/credits/topup/session', {
      method: 'POST',
      body: { optionKey }
    })
    window.location.href = res.redirectUrl
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Could not start top-up',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Unknown error',
      color: 'error'
    })
  } finally {
    topupLoadingKey.value = null
  }
}

async function startHoldTopup() {
  if (holdTopupLoading.value) return
  holdTopupLoading.value = true
  try {
    const res = await $fetch<{ redirectUrl: string }>('/api/holds/topup/session', {
      method: 'POST'
    })
    window.location.href = res.redirectUrl
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Could not start hold purchase',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Unknown error',
      color: 'error'
    })
  } finally {
    holdTopupLoading.value = false
  }
}

function readQueryString(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.trim())
    if (typeof first === 'string' && first.trim()) return first.trim()
  }
  return null
}

async function claimTopupFromRoute() {
  const topupToken = readQueryString(route.query.topup)
  const topupOrderId = readQueryString(route.query.orderId) ?? readQueryString(route.query.order_id)
  if (topupClaiming.value) return

  topupClaiming.value = true
  let shouldClearTopupQuery = false
  try {
    const maxAttempts = topupToken ? 7 : 1
    let attempt = 0
    let res: {
      status: 'processed' | 'pending' | 'failed'
      creditsAdded?: number
      newBalance?: number | null
      message?: string
    } | null = null

    while (attempt < maxAttempts) {
      res = await $fetch<{
        status: 'processed' | 'pending' | 'failed'
        creditsAdded?: number
        newBalance?: number | null
        message?: string
        debug?: Record<string, unknown>
      }>('/api/credits/topup/claim', {
        method: 'POST',
        body: topupToken
          ? { token: topupToken, orderId: topupOrderId ?? undefined }
          : {}
      })
      if (res.status !== 'pending') break
      attempt += 1
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    }

    if (!res) return

    if (res.status === 'pending') {
      if (topupToken) {
        toast.add({
          title: 'Top-up pending',
          description: res.message ?? 'Payment confirmation is still syncing. Refresh in a moment.',
          color: 'warning'
        })
      }
      return
    }

    if (res.status === 'failed') {
      if (topupToken) {
        toast.add({
          title: 'Top-up failed',
          description: res.message ?? 'This top-up session is no longer valid. Please start a new purchase.',
          color: 'error'
        })
        shouldClearTopupQuery = true
      }
      return
    }

    if ((res.creditsAdded ?? 0) > 0) {
      const added = typeof res.creditsAdded === 'number' ? `${res.creditsAdded} credits added.` : 'Credits updated.'
      const balanceLine = res.newBalance !== null && res.newBalance !== undefined ? ` New balance: ${res.newBalance}.` : ''
      toast.add({
        title: 'Top-up complete',
        description: `${added}${balanceLine}`,
        color: 'success'
      })
    }

    if (topupToken) shouldClearTopupQuery = true
    await refreshAll()
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    if (topupToken) {
      toast.add({
        title: 'Top-up pending',
        description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Payment confirmation is still syncing.',
        color: 'warning'
      })
    }
  } finally {
    topupClaiming.value = false
    if (shouldClearTopupQuery && route.query.topup) {
      const nextQuery = { ...route.query }
      delete nextQuery.topup
      delete nextQuery.orderId
      delete nextQuery.order_id
      router.replace({ query: nextQuery })
    }
  }
}

async function claimHoldTopupFromRoute() {
  const holdTopupToken = readQueryString(route.query.hold_topup)
  const holdTopupOrderId = readQueryString(route.query.orderId) ?? readQueryString(route.query.order_id)
  if (holdTopupClaiming.value || !holdTopupToken) return

  holdTopupClaiming.value = true
  let shouldClearHoldTopupQuery = false
  try {
    const maxAttempts = 7
    let attempt = 0
    let res: {
      status: 'processed' | 'pending' | 'failed'
      holdsAdded?: number
      newHoldBalance?: number | null
      message?: string
    } | null = null

    while (attempt < maxAttempts) {
      res = await $fetch<{
        status: 'processed' | 'pending' | 'failed'
        holdsAdded?: number
        newHoldBalance?: number | null
        message?: string
      }>('/api/holds/topup/claim', {
        method: 'POST',
        body: { token: holdTopupToken, orderId: holdTopupOrderId ?? undefined }
      })
      if (res.status !== 'pending') break
      attempt += 1
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    }

    if (!res) return

    if (res.status === 'pending') {
      toast.add({
        title: 'Hold purchase pending',
        description: res.message ?? 'Payment confirmation is still syncing. Refresh in a moment.',
        color: 'warning'
      })
      return
    }

    if (res.status === 'failed') {
      toast.add({
        title: 'Hold purchase failed',
        description: res.message ?? 'This hold purchase is no longer valid. Please start a new purchase.',
        color: 'error'
      })
      shouldClearHoldTopupQuery = true
      return
    }

    const added = typeof res.holdsAdded === 'number'
      ? `${res.holdsAdded} hold${res.holdsAdded === 1 ? '' : 's'} added.`
      : 'Hold balance updated.'
    const balanceLine = res.newHoldBalance !== null && res.newHoldBalance !== undefined
      ? ` New paid hold balance: ${res.newHoldBalance}.`
      : ''
    toast.add({
      title: 'Hold purchase complete',
      description: `${added}${balanceLine}`,
      color: 'success'
    })
    shouldClearHoldTopupQuery = true
    await refreshAll()
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Hold purchase pending',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Payment confirmation is still syncing.',
      color: 'warning'
    })
  } finally {
    holdTopupClaiming.value = false
    if (shouldClearHoldTopupQuery && route.query.hold_topup) {
      const nextQuery = { ...route.query }
      delete nextQuery.hold_topup
      delete nextQuery.orderId
      delete nextQuery.order_id
      router.replace({ query: nextQuery })
    }
  }
}

onMounted(async () => {
  dashboardHydrated.value = true
  if (hasActiveMembership.value && topupOptionsPending.value) {
    startTopupOptionsLoadTimers()
  } else if (hasActiveMembership.value && (topupOptions.value?.length ?? 0) > 0) {
    topupOptionsProgress.value = 100
  }
  await router.isReady()
  await claimTopupFromRoute()
  await claimHoldTopupFromRoute()
})

watch(
  () => [route.query.topup, route.query.hold_topup, route.query.orderId, route.query.order_id],
  () => {
    if (import.meta.client) {
      void claimTopupFromRoute()
      void claimHoldTopupFromRoute()
    }
  }
)

onUnmounted(() => {
  clearTopupOptionsLoadTimers()
})
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <UDashboardPanel
      id="membership"
      class="min-h-0 flex-1"
    >
      <template #header>
        <UDashboardNavbar
          title="Membership"
          :ui="{ right: 'gap-3' }"
        >
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-refresh-cw"
              @click="refreshAll"
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="p-4 space-y-4">
          <!-- ── No membership: inline tier picker ──────────────────────── -->
          <template v-if="membershipState === 'none' || (showCatalog && tierCatalog?.length)">
            <UCard
              v-if="membershipState === 'none'"
              class="mb-2"
            >
              <div class="flex items-center gap-3">
                <UIcon
                  name="i-lucide-badge-x"
                  class="size-8 text-dimmed shrink-0"
                />
                <div>
                  <h2 class="font-semibold">
                    No membership yet
                  </h2>
                  <p class="mt-0.5 text-sm text-dimmed">
                    Choose a plan below to get started. Credits are minted when your first invoice is paid.
                  </p>
                </div>
              </div>
            </UCard>

            <!-- Canceled/inactive state notice -->
            <UAlert
              v-if="membershipState === 'canceled' || membershipState === 'inactive'"
              color="neutral"
              variant="soft"
              icon="i-lucide-circle-off"
              title="Membership ended"
              description="Your previous membership has ended. Pick a plan below to reactivate."
            />

            <!-- Tier cards -->
            <div
              v-if="tierCatalog?.length"
              class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              <UCard
                v-for="t in tierCatalog"
                :key="t.id"
                class="flex flex-col"
              >
                <div class="flex-1 space-y-3">
                  <div class="flex items-center gap-2">
                    <div class="font-semibold text-base">
                      {{ t.display_name }}
                    </div>
                    <UBadge
                      v-if="t.adminOnly"
                      color="warning"
                      variant="soft"
                      size="xs"
                      icon="i-lucide-flask-conical"
                    >
                      Admin only
                    </UBadge>
                  </div>
                  <p
                    v-if="t.description"
                    class="text-sm text-dimmed"
                  >
                    {{ t.description }}
                  </p>
                  <ul class="text-sm space-y-1.5 text-dimmed">
                    <li class="flex justify-between">
                      <span>Booking window</span>
                      <span class="font-medium text-default">{{ t.booking_window_days }}d</span>
                    </li>
                    <li class="flex justify-between">
                      <span>Peak-hour rate</span>
                      <span class="font-medium text-default">{{ formatPeakCredits(t.peak_multiplier) }} credits/hr</span>
                    </li>
                    <li class="flex justify-between">
                      <span>Max credit bank</span>
                      <span class="font-medium text-default">{{ t.max_bank }} cr</span>
                    </li>
                    <li class="flex justify-between">
                      <span>Hold cap / month</span>
                      <span class="font-medium text-default">{{ t.holds_included }} hold{{ t.holds_included === 1 ? '' : 's' }}</span>
                    </li>
                  </ul>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-info"
                    @click="openCatalogTierDetails(t.id)"
                  >
                    See full plan breakdown
                  </UButton>
                </div>

                <div class="mt-4 space-y-2 border-t border-default pt-4">
                  <div
                    v-for="plan in t.membership_plan_variations"
                    :key="plan.cadence"
                    class="flex items-center justify-between gap-2"
                  >
                    <div class="text-sm">
                      <span class="font-medium">{{ formatCadence(plan.cadence) }}</span>
                      <span class="text-dimmed"> · {{ plan.credits_per_month }} cr/mo</span>
                      <UBadge
                        v-if="getDiscountLabel(plan.discount_label)"
                        color="success"
                        variant="soft"
                        size="xs"
                        class="ml-1"
                      >
                        {{ getDiscountLabel(plan.discount_label) }}
                      </UBadge>
                    </div>
                    <UButton
                      size="xs"
                      @click="goCheckout(t.id, plan.cadence)"
                    >
                      {{ formatPrice(plan.price_cents) }}{{ cadencePriceSuffix(plan.cadence) }}
                    </UButton>
                  </div>
                </div>
              </UCard>
            </div>

            <div
              v-else-if="showCatalog"
              class="flex items-center justify-center py-10"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="size-6 animate-spin text-dimmed"
              />
            </div>
          </template>

          <!-- ── Pending checkout ────────────────────────────────────────── -->
          <template v-else-if="membershipState === 'pending_checkout'">
            <UAlert
              color="warning"
              variant="soft"
              title="Checkout not completed"
              description="Your membership is reserved but payment hasn't been processed yet."
            />
            <UCard>
              <div class="text-center py-6">
                <UIcon
                  name="i-lucide-clock"
                  class="size-10 text-warning mx-auto mb-3"
                />
                <h2 class="font-semibold">
                  Awaiting payment
                </h2>
                <p class="mt-2 text-sm text-dimmed max-w-xs mx-auto">
                  Complete checkout to activate your membership.
                </p>
                <div class="mt-4 flex gap-2 justify-center">
                  <UButton @click="goCheckout(membership?.tier ?? 'creator', membership?.cadence ?? 'monthly')">
                    Retry checkout
                  </UButton>
                  <UButton
                    color="neutral"
                    variant="soft"
                    @click="() => refresh()"
                  >
                    Refresh status
                  </UButton>
                </div>
              </div>
            </UCard>
          </template>

          <!-- ── Active or other states: plan summary ───────────────────── -->
          <template v-else>
            <!-- Status banner for non-active states -->
            <UAlert
              v-if="membershipState !== 'active'"
              :color="statusColor"
              variant="soft"
              :title="membershipState === 'past_due' ? 'Payment past due' : 'Membership inactive'"
              description="Please update your payment method or contact support."
            />
            <UAlert
              v-if="subscriptionState?.pendingSwap"
              color="info"
              variant="soft"
              icon="i-lucide-calendar-sync"
              :title="`Plan change scheduled${subscriptionState?.pendingSwap?.target?.displayName ? `: ${subscriptionState.pendingSwap.target.displayName}` : ''}`"
              :description="`This change takes effect on ${formatDateLabel(subscriptionState.pendingSwap.effectiveDate) ?? 'your next billing cycle'}.`"
            />
            <UAlert
              v-if="subscriptionState?.pendingCancel"
              color="warning"
              variant="soft"
              icon="i-lucide-calendar-x"
              :title="'Cancellation scheduled'"
              :description="`Your membership remains active through ${formatDateLabel(subscriptionState.pendingCancel.effectiveDate) ?? 'the current billing cycle end'}.`"
            />

            <!-- Plan summary -->
            <div class="grid gap-4 md:grid-cols-2">
              <UCard>
                <div class="space-y-3">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <div class="text-xs text-dimmed uppercase tracking-wide">
                        Current plan
                      </div>
                      <div class="mt-1 text-xl font-semibold">
                        {{ tier?.display_name ?? membership?.tier ?? '—' }}
                      </div>
                    </div>
                    <UBadge
                      :color="statusColor"
                      variant="soft"
                    >
                      {{ formatStatus(membership?.status) }}
                    </UBadge>
                  </div>

                  <p
                    v-if="tier?.description"
                    class="text-sm text-dimmed"
                  >
                    {{ tier.description }}
                  </p>

                  <div class="pt-2 border-t border-default space-y-2 text-sm">
                    <div class="flex justify-between">
                      <span class="text-dimmed">Billing cycle</span>
                      <span>{{ formatCadence(membership?.cadence ?? null) }}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-dimmed">Monthly price</span>
                      <span>{{ formatPrice(currentVariation?.price_cents ?? null) }}{{ cadencePriceSuffix(membership?.cadence ?? null) }}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-dimmed">Credits / month</span>
                      <span>{{ currentVariation?.credits_per_month ?? '—' }}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-dimmed">Member since</span>
                      <span>{{ memberSince(membership?.created_at ?? null) }}</span>
                    </div>
                  </div>
                </div>
              </UCard>

              <!-- Tier features -->
              <UCard>
                <div class="space-y-3">
                  <div class="text-xs text-dimmed uppercase tracking-wide">
                    Plan features
                  </div>
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <span class="text-dimmed">Booking window</span>
                      <span>{{ tier?.booking_window_days ?? '—' }} days</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-dimmed">Peak-hour rate</span>
                      <span>{{ formatPeakCredits(tier?.peak_multiplier) }} credits/hr</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-dimmed">Max credit bank</span>
                      <span>{{ tier?.max_bank ?? '—' }} credits</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-dimmed">Hold cap / month</span>
                      <span>{{ tier?.holds_included ?? 0 }} hold{{ (tier?.holds_included ?? 0) === 1 ? '' : 's' }}</span>
                    </div>
                  </div>
                </div>
              </UCard>
            </div>

            <!-- Other cadence options for this tier -->
            <UCard v-if="(variations?.length ?? 0) > 1">
              <div class="space-y-3">
                <div class="text-sm font-medium">
                  Other billing options for {{ tier?.display_name }}
                </div>
                <p class="text-xs text-dimmed">
                  Membership changes are scheduled for your next billing cycle. No prorated mid-cycle membership changes.
                </p>
                <div class="grid gap-2 sm:grid-cols-3">
                  <div
                    v-for="v in variations"
                    :key="v.cadence"
                    class="rounded-lg border p-3 text-sm"
                    :class="v.cadence === membership?.cadence ? 'border-primary bg-primary/5' : 'border-default'"
                  >
                    <div class="font-medium flex items-center gap-1">
                      {{ formatCadence(v.cadence) }}
                      <UBadge
                        v-if="v.cadence === membership?.cadence"
                        color="primary"
                        size="xs"
                        variant="soft"
                      >
                        Current
                      </UBadge>
                      <UBadge
                        v-if="getDiscountLabel(v.discount_label)"
                        color="success"
                        size="xs"
                        variant="soft"
                      >
                        {{ getDiscountLabel(v.discount_label) }}
                      </UBadge>
                    </div>
                    <div class="text-dimmed mt-1">
                      {{ formatPrice(v.price_cents) }}{{ cadencePriceSuffix(v.cadence) }} · {{ v.credits_per_month }} cr/mo
                    </div>
                    <UButton
                      v-if="v.cadence !== membership?.cadence"
                      size="xs"
                      class="mt-2"
                      variant="soft"
                      :disabled="Boolean(subscriptionState?.pendingCancel)"
                      @click="schedulePlanChange(membership?.tier ?? 'creator', v.cadence)"
                    >
                      Schedule {{ formatCadence(v.cadence) }}
                    </UButton>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Actions -->
            <UCard>
              <div class="text-sm font-medium mb-3">
                Manage membership
              </div>
              <p class="mb-3 text-xs text-dimmed">
                Upgrades and downgrades take effect on the next billing cycle.
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-list-checks"
                  @click="goMembershipSelector"
                >
                  Browse memberships
                </UButton>
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-rotate-ccw"
                  :loading="membershipUndoCancelLoading"
                  :disabled="!subscriptionState?.pendingCancel || membershipCancelLoading || membershipUndoCancelLoading"
                  @click="undoMembershipCancellation"
                >
                  Undo cancel
                </UButton>
                <UButton
                  color="warning"
                  variant="soft"
                  icon="i-lucide-calendar-x"
                  :loading="membershipCancelLoading"
                  :disabled="Boolean(subscriptionState?.pendingCancel) || membershipCancelLoading || membershipUndoCancelLoading"
                  @click="cancelMembershipAtPeriodEnd"
                >
                  Cancel at period end
                </UButton>
              </div>
              <p class="mt-3 text-xs text-dimmed">
                Plan and cancellation actions are synchronized with Square. If your subscription status looks out of sync, refresh this page or contact support.
              </p>

              <div class="mt-4 border-t border-default pt-4">
                <div class="text-xs text-dimmed uppercase tracking-wide">
                  Door access code
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <span class="font-mono text-xl font-semibold">
                    {{ doorCodeState?.doorCode ?? 'Not assigned yet' }}
                  </span>
                  <UBadge
                    v-if="doorCodeState?.latestRequest?.status === 'pending'"
                    color="warning"
                    variant="soft"
                    size="xs"
                  >
                    Change requested
                  </UBadge>
                </div>
                <p class="mt-1 text-xs text-dimmed">
                  This code stays the same when you change plans. You can request one manual change every 30 days.
                </p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    :loading="doorCodeRequestLoading"
                    :disabled="!doorCodeState?.canRequestChange || doorCodeRequestLoading"
                    @click="requestDoorCodeChange"
                  >
                    Request code change
                  </UButton>
                  <span
                    v-if="doorCodeState?.cooldownEndsAt && !doorCodeState?.canRequestChange"
                    class="text-xs text-dimmed"
                  >
                    Next request: {{ formatDateLabel(doorCodeState.cooldownEndsAt) ?? doorCodeState.cooldownEndsAt }}
                  </span>
                </div>
              </div>
            </UCard>

            <!-- Credits + ledger + top-up bundles -->
            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <UCard id="credits">
                <div class="space-y-3">
                  <div class="flex items-center justify-between gap-2">
                    <div>
                      <div class="text-xs text-dimmed uppercase tracking-wide">
                        Credits
                      </div>
                      <div class="mt-1 text-3xl font-semibold">
                        {{ balance ?? 0 }}
                      </div>
                    </div>
                    <UButton
                      size="sm"
                      color="neutral"
                      variant="soft"
                      to="/dashboard/book"
                    >
                      Book studio
                    </UButton>
                  </div>

                  <p class="text-sm text-dimmed">
                    Need extra credit capacity this month? Purchase top-ups instantly.
                  </p>

                  <ClientOnly>
                    <div
                      v-if="hasActiveMembership && topupOptionsPending && !topupOptionsTimedOut"
                      class="space-y-2"
                    >
                      <div class="h-2 w-full overflow-hidden rounded bg-elevated">
                        <div
                          class="h-full bg-primary transition-[width] duration-200"
                          :style="{ width: `${topupOptionsProgress}%` }"
                        />
                      </div>
                      <div class="text-xs text-dimmed">
                        Loading available top-up options…
                      </div>
                    </div>
                  </ClientOnly>

                  <div
                    v-if="topupOptions?.length"
                    class="grid gap-2 sm:grid-cols-2"
                  >
                    <div
                      v-for="option in topupOptions ?? []"
                      :key="option.key"
                      class="rounded-xl border border-default p-3"
                    >
                      <div class="flex items-center justify-between">
                        <div class="font-medium">
                          {{ option.label }}
                        </div>
                        <div class="text-sm text-dimmed">
                          {{ formatOptionUnit(option) }}/credit
                        </div>
                      </div>
                      <div class="mt-1 text-lg font-semibold flex items-center gap-2">
                        <span>{{ formatPrice(option.effectivePriceCents) }}</span>
                        <span
                          v-if="option.saleActive && option.salePriceCents !== null"
                          class="text-sm text-dimmed line-through"
                        >
                          {{ formatPrice(option.basePriceCents) }}
                        </span>
                      </div>
                      <div
                        v-if="option.description"
                        class="mt-1 text-xs text-dimmed"
                      >
                        {{ option.description }}
                      </div>
                      <div
                        v-if="option.saleActive"
                        class="mt-1 text-xs text-success"
                      >
                        Sale active
                        <span v-if="formatSaleWindow(option.saleStartsAt, option.saleEndsAt)">
                          · {{ formatSaleWindow(option.saleStartsAt, option.saleEndsAt) }}
                        </span>
                      </div>
                      <UButton
                        class="mt-3"
                        size="xs"
                        block
                        :loading="topupLoadingKey === option.key"
                        :disabled="topupLoadingKey !== null || topupClaiming"
                        @click="startTopup(option.key)"
                      >
                        Buy {{ option.credits }} credit{{ option.credits === 1 ? '' : 's' }}
                      </UButton>
                    </div>
                  </div>
                  <div
                    v-if="hasActiveMembership && !(topupOptions?.length) && (!topupOptionsPending || topupOptionsTimedOut)"
                    class="text-xs text-dimmed"
                  >
                    No credit top-up options are active right now.
                  </div>

                  <div
                    id="holds"
                    class="mt-4 border-t border-default pt-4 space-y-3"
                  >
                    <div class="text-xs text-dimmed uppercase tracking-wide">
                      Holds
                    </div>
                    <div class="grid gap-2 sm:grid-cols-3 text-sm">
                      <div class="rounded-lg border border-default p-2">
                        <div class="text-xs text-dimmed">
                          Monthly cap
                        </div>
                        <div class="font-semibold">
                          {{ holdSummary?.holdsIncluded ?? 0 }}
                        </div>
                      </div>
                      <div class="rounded-lg border border-default p-2">
                        <div class="text-xs text-dimmed">
                          Used this cycle
                        </div>
                        <div class="font-semibold">
                          {{ holdSummary?.holdsUsedThisCycle ?? 0 }}
                        </div>
                      </div>
                      <div class="rounded-lg border border-default p-2">
                        <div class="text-xs text-dimmed">
                          Remaining this cycle
                        </div>
                        <div class="font-semibold">
                          {{ holdSummary?.includedHoldsRemaining ?? 0 }}
                        </div>
                      </div>
                    </div>
                    <div class="rounded-lg border border-default p-2 text-sm">
                      <div class="text-xs text-dimmed">
                        Paid hold balance
                      </div>
                      <div class="font-semibold">
                        {{ holdSummary?.paidHoldBalance ?? 0 }}
                      </div>
                    </div>
                    <div class="text-xs text-dimmed">
                      Hold windows run until the earlier of 10am next day or peak-hours start. If your monthly cap is exhausted, booking with an overnight hold consumes one paid hold.
                    </div>
                    <div
                      v-if="holdSummary?.cycleStartIso && holdSummary?.cycleEndIso"
                      class="text-xs text-dimmed"
                    >
                      Current hold cycle: {{ formatDateLabel(holdSummary.cycleStartIso) }} to {{ formatDateLabel(holdSummary.cycleEndIso) }}
                    </div>

                    <div
                      v-if="holdTopupOffer"
                      class="rounded-xl border border-default p-3"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="font-medium">
                            {{ holdTopupOffer.label }}
                          </div>
                          <div class="text-xs text-dimmed">
                            Adds {{ holdTopupOffer.holds }} hold{{ holdTopupOffer.holds === 1 ? '' : 's' }}
                          </div>
                        </div>
                        <div class="text-lg font-semibold">
                          {{ formatPrice(holdTopupOffer.amountCents, holdTopupOffer.currency) }}
                        </div>
                      </div>
                      <UButton
                        class="mt-3"
                        size="xs"
                        block
                        :loading="holdTopupLoading || holdTopupClaiming"
                        :disabled="holdTopupLoading || holdTopupClaiming"
                        @click="startHoldTopup"
                      >
                        Buy hold{{ holdTopupOffer.holds === 1 ? '' : 's' }}
                      </UButton>
                    </div>
                  </div>
                </div>
              </UCard>

              <UCard>
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <div class="text-xs text-dimmed uppercase tracking-wide">
                      Recent credit activity
                    </div>
                    <div class="mt-1 text-sm text-dimmed">
                      Newest first
                    </div>
                  </div>
                </div>

                <div
                  v-if="!ledger?.length"
                  class="mt-4 text-sm text-dimmed"
                >
                  No credit activity yet.
                </div>

                <div
                  v-else
                  class="mt-3 divide-y divide-default"
                >
                  <div
                    v-for="row in ledger"
                    :key="row.id"
                    class="py-3 flex items-start justify-between gap-4"
                  >
                    <div class="min-w-0">
                      <div class="text-sm font-medium truncate">
                        {{ formatLedgerTitle(row) }}
                      </div>
                      <div class="mt-1 text-xs text-dimmed">
                        {{ formatLedgerTimestamp(row.created_at) }}
                        <span v-if="row.external_ref"> · ref: {{ row.external_ref }}</span>
                      </div>
                    </div>
                    <div
                      class="text-sm font-semibold shrink-0"
                      :class="asNumber(row.delta) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                    >
                      {{ formatDelta(row.delta) }}
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
          </template>
        </div>
      </template>
    </UDashboardPanel>

    <UModal
      v-model:open="catalogDetailsOpen"
      :dismissible="true"
    >
      <template #content>
        <UCard v-if="catalogDetails">
          <template #header>
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-semibold">
                  {{ catalogDetails.title }}
                </div>
                <p class="mt-1 text-sm text-dimmed">
                  {{ catalogDetails.summary }}
                </p>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="catalogDetailsOpen = false"
              />
            </div>
          </template>

          <div class="space-y-4">
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed mb-2">
                Best for
              </div>
              <ul class="space-y-1 text-sm">
                <li
                  v-for="item in catalogDetails.bestFor"
                  :key="item"
                >
                  • {{ item }}
                </li>
              </ul>
            </div>

            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed mb-2">
                Plan benefits
              </div>
              <ul class="space-y-1 text-sm">
                <li
                  v-for="item in catalogDetails.benefits"
                  :key="item"
                >
                  • {{ item }}
                </li>
              </ul>
            </div>

            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed mb-2">
                Included
              </div>
              <ul class="space-y-1 text-sm">
                <li
                  v-for="item in catalogDetails.includes"
                  :key="item"
                >
                  • {{ item }}
                </li>
              </ul>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
