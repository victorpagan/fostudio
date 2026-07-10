<script setup lang="ts">
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const router = useRouter()
const toast = useToast()

type MembershipRow = {
  status: string | null
  current_period_end: string | null
  canceled_at: string | null
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
}

type CreditSummary = {
  totalBalance: number
  bankBalance: number
  topoffBalance: number
  expiringSoonCredits: number
  expiringSoonAt: string | null
  maxBank: number
  atCap: boolean
  overCap: boolean
  canBuyTopoff: boolean
  membershipCreditExpiryDays: number
  topoffCreditExpiryDays: number
}
type SavedCardMethod = {
  id: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  cardholderName: string | null
  enabled: boolean
}
type PaymentMethodsResponse = {
  methods: SavedCardMethod[]
  defaultCardId?: string | null
}

const {
  data: membership,
  pending: membershipPending,
  error: membershipError,
  refresh: refreshMembership
} = await useAsyncData('dash:credits:membership', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('status,current_period_end,canceled_at')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as MembershipRow | null
})

const membershipState = computed(() => resolveMembershipUiState(membership.value))
const membershipResolved = computed(() => !membershipPending.value && !membershipError.value)
const hasActiveMembership = computed(() => membershipResolved.value && membershipState.value === 'active')

const { data: balance, error: balanceError, refresh: refreshBalance } = await useAsyncData('dash:credits:balance', async () => {
  if (!user.value) return 0
  const { data, error } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return asNumber(data?.balance)
}, { watch: [user, hasActiveMembership] })

const {
  data: ledger,
  pending: ledgerPending,
  error: ledgerError,
  refresh: refreshLedger
} = await useAsyncData('dash:credits:ledger', async () => {
  if (!user.value) return []
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('id,delta,reason,external_ref,created_at,metadata')
    .eq('user_id', user.value.sub)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return (data ?? []) as LedgerRow[]
}, { watch: [user, hasActiveMembership] })

const {
  data: topupOptions,
  refresh: refreshTopupOptions,
  pending: topupOptionsPending,
  error: topupOptionsError
} = await useAsyncData('dash:credits:topups', async () => {
  if (!user.value) return []
  const res = await $fetch<{ options: CreditTopupOption[] }>('/api/credits/topup/options')
  return res?.options ?? []
}, { watch: [user, hasActiveMembership] })

const { data: creditSummary, error: creditSummaryError, refresh: refreshCreditSummary } = await useAsyncData('dash:credits:summary', async () => {
  if (!user.value) return null
  const res = await $fetch<{ summary: CreditSummary | null }>('/api/credits/summary')
  return res.summary
}, { watch: [user, hasActiveMembership] })
const { data: paymentMethodsData, refresh: refreshPaymentMethods } = await useAsyncData('dash:credits:payment-methods', async () => {
  if (!user.value?.sub) return { methods: [] as SavedCardMethod[], defaultCardId: null }
  return await $fetch<PaymentMethodsResponse>('/api/payments/methods')
}, { watch: [() => user.value?.sub], server: false })

const displayedCreditBalance = computed(() => creditSummary.value?.totalBalance ?? balance.value ?? 0)
const canBuyTopoff = computed(() => creditSummary.value?.canBuyTopoff ?? true)
const savedCards = computed(() => (paymentMethodsData.value?.methods ?? []).filter(card => card.enabled))
const defaultSavedCardId = computed(() => {
  const preferred = paymentMethodsData.value?.defaultCardId ?? null
  if (preferred && savedCards.value.some(card => card.id === preferred)) return preferred
  return savedCards.value[0]?.id ?? null
})
const hasSavedCardOnFile = computed(() => Boolean(defaultSavedCardId.value))

const topupLoadingKey = ref<string | null>(null)
const topupClaimInFlight = ref(false)
const topupClaimingFromRoute = ref(false)
const paymentModalOpen = ref(false)
const savedCardConfirmOpen = ref(false)
const paymentSubmitting = ref(false)
const paymentError = ref<string | null>(null)
const pendingTopupToken = ref<string | null>(null)
const pendingTopupAmountCents = ref(0)
const pendingTopupCurrency = ref('USD')
const pendingTopupLabel = ref('credits')
const promoCode = ref('')
const dashboardHydrated = ref(false)
const activeCreditsTab = ref<'buy' | 'history'>('buy')
const defaultSavedCard = computed(() => savedCards.value.find(card => card.id === defaultSavedCardId.value) ?? null)
const nonMemberCreditsTitle = computed(() => {
  if (membershipState.value === 'past_due') return 'Membership payment is past due'
  if (membershipState.value === 'pending_checkout') return 'Membership checkout is incomplete'
  if (membershipState.value === 'canceled') return 'Buying credits after cancellation'
  if (membershipState.value === 'inactive') return 'Buying credits with an expired membership'
  return 'Buying credits as a guest'
})
const nonMemberCreditsDescription = computed(() => {
  if (membershipState.value === 'past_due') {
    return 'Member benefits are paused until billing recovers. Credit purchases and bookings currently follow confirmed non-member account rules.'
  }
  if (membershipState.value === 'pending_checkout') {
    return 'Payment has not activated member benefits yet. Credit purchases and bookings follow confirmed non-member account rules until checkout completes.'
  }
  return 'Guest bookings use higher credit rates and are limited to the guest booking window. Buy a bundle here or choose a time first and pay only the credit shortfall during booking.'
})

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function formatCredits(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0'
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function formatPrice(cents: number | null, currency = 'USD') {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function formatOptionUnit(option: CreditTopupOption) {
  const perCredit = option.effectivePriceCents / option.credits
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(perCredit / 100)
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) return null
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return null
  if (!dashboardHydrated.value) return dt.toISOString().slice(0, 10)
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles'
  })
}

function formatLedgerTimestamp(value: string) {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  if (!dashboardHydrated.value) {
    const iso = dt.toISOString()
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
  }
  return dt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
}

function formatDelta(value: number | string) {
  const n = asNumber(value)
  return n > 0 ? `+${n}` : `${n}`
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

function formatLedgerTitle(row: LedgerRow) {
  const reason = (row.reason || '').toLowerCase()
  if (reason === 'topoff') {
    const label = row.metadata?.option_label
    if (typeof label === 'string' && label.trim()) return label.trim()
  }
  return formatLedgerReason(row.reason)
}

function formatSaleWindow(start: string | null, end: string | null) {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Los_Angeles'
  }
  const from = start ? new Date(start) : null
  const to = end ? new Date(end) : null
  const fromLabel = from && !Number.isNaN(from.getTime())
    ? (dashboardHydrated.value ? from.toLocaleDateString('en-US', options) : from.toISOString().slice(0, 10))
    : null
  const toLabel = to && !Number.isNaN(to.getTime())
    ? (dashboardHydrated.value ? to.toLocaleDateString('en-US', options) : to.toISOString().slice(0, 10))
    : null
  if (fromLabel && toLabel) return `${fromLabel} to ${toLabel}`
  if (fromLabel) return `Starts ${fromLabel}`
  if (toLabel) return `Ends ${toLabel}`
  return null
}

function showRefreshPageToast() {
  toast.add({
    title: 'Update saved',
    description: 'Refresh this page if balances or history still look stale.',
    color: 'info',
    actions: [{
      label: 'Refresh page',
      color: 'neutral',
      variant: 'soft',
      onClick: () => {
        if (import.meta.client) window.location.reload()
      }
    }]
  })
}

async function refreshAll() {
  await Promise.allSettled([
    refreshMembership(),
    refreshBalance(),
    refreshCreditSummary(),
    refreshLedger(),
    refreshTopupOptions(),
    refreshPaymentMethods()
  ])
}

async function startTopup(optionKey: string) {
  paymentError.value = null
  topupLoadingKey.value = optionKey
  try {
    const res = await $fetch<{
      topupToken: string
      amountCents: number
      currency?: string
      label?: string
    }>('/api/credits/topup/session', {
      method: 'POST',
      body: {
        optionKey,
        promo_code: promoCode.value.trim() || undefined
      }
    })
    if (!res.topupToken) {
      throw new Error('Top-up session did not return a token.')
    }
    pendingTopupToken.value = res.topupToken
    pendingTopupAmountCents.value = Number(res.amountCents ?? 0)
    pendingTopupCurrency.value = String(res.currency ?? 'USD').toUpperCase()
    pendingTopupLabel.value = typeof res.label === 'string' && res.label.trim() ? res.label.trim() : 'credits'
    if (defaultSavedCardId.value) {
      savedCardConfirmOpen.value = true
      return
    }
    paymentModalOpen.value = true
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

async function confirmTopupPayment(payload: { sourceId: string }) {
  await processTopupPayment({ sourceId: payload.sourceId })
}

async function confirmTopupCardOnFile(cardId: string) {
  await processTopupPayment({ cardId })
}

async function confirmSavedCardTopup() {
  if (!defaultSavedCardId.value) return
  await confirmTopupCardOnFile(defaultSavedCardId.value)
  if (!paymentError.value) savedCardConfirmOpen.value = false
}

function useAnotherCardForTopup() {
  savedCardConfirmOpen.value = false
  paymentModalOpen.value = true
}

async function processTopupPayment(payload: { sourceId?: string, cardId?: string }) {
  if (!pendingTopupToken.value || paymentSubmitting.value) return
  paymentSubmitting.value = true
  paymentError.value = null
  try {
    const res = await $fetch<{
      status: 'processed' | 'pending' | 'failed'
      creditsAdded?: number
      newBalance?: number | null
      message?: string
    }>('/api/credits/topup/pay', {
      method: 'POST',
      body: {
        token: pendingTopupToken.value,
        ...(payload.sourceId ? { sourceId: payload.sourceId } : {}),
        ...(payload.cardId ? { cardId: payload.cardId } : {})
      }
    })

    if (res.status !== 'processed') {
      throw new Error(res.message ?? 'Top-up is still processing.')
    }

    paymentModalOpen.value = false
    const added = Number(res.creditsAdded ?? 0)
    const balance = res.newBalance
    toast.add({
      title: 'Top-up complete',
      description: added > 0
        ? `${added} credits added${balance !== null && balance !== undefined ? ` · New balance: ${balance}` : ''}.`
        : 'Credits updated.'
    })
    showRefreshPageToast()
    await refreshAll()
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    paymentError.value = e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Could not complete top-up payment.'
    if (payload.cardId) {
      savedCardConfirmOpen.value = false
      paymentModalOpen.value = true
      await refreshPaymentMethods()
    }
  } finally {
    paymentSubmitting.value = false
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
  if (topupClaimInFlight.value || !topupToken) return

  topupClaimInFlight.value = true
  topupClaimingFromRoute.value = true
  let shouldClearTopupQuery = false
  try {
    const maxAttempts = 7
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
      }>('/api/credits/topup/claim', {
        method: 'POST',
        body: { token: topupToken, orderId: topupOrderId ?? undefined }
      })

      if (res.status !== 'pending') break
      attempt += 1
      if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, 1500))
    }

    if (!res) return

    if (res.status === 'pending') {
      toast.add({
        title: 'Top-up pending',
        description: res.message ?? 'Payment confirmation is still syncing. Refresh in a moment.',
        color: 'warning'
      })
      return
    }

    if (res.status === 'failed') {
      toast.add({
        title: 'Top-up failed',
        description: res.message ?? 'This top-up session is no longer valid. Please start a new purchase.',
        color: 'error'
      })
      shouldClearTopupQuery = true
      return
    }

    if ((res.creditsAdded ?? 0) > 0) {
      const added = `${res.creditsAdded} credits added.`
      const balanceLine = res.newBalance !== null && res.newBalance !== undefined ? ` New balance: ${res.newBalance}.` : ''
      toast.add({ title: 'Top-up complete', description: `${added}${balanceLine}`, color: 'success' })
    }

    shouldClearTopupQuery = true
    await refreshAll()
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Top-up pending',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Payment confirmation is still syncing.',
      color: 'warning'
    })
  } finally {
    topupClaimInFlight.value = false
    topupClaimingFromRoute.value = false
    if (shouldClearTopupQuery && route.query.topup) {
      const nextQuery = { ...route.query }
      delete nextQuery.topup
      delete nextQuery.orderId
      delete nextQuery.order_id
      router.replace({ query: nextQuery })
    }
  }
}

onMounted(async () => {
  dashboardHydrated.value = true
  await refreshAll()
  await claimTopupFromRoute()
})

watch(
  () => [route.query.topup, route.query.orderId, route.query.order_id],
  () => {
    if (import.meta.client) void claimTopupFromRoute()
  }
)
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <DashboardPageScaffold
      panel-id="credits"
      title="Credits"
    >
      <template #right>
        <DashboardActionGroup
          :secondary="[
            {
              label: 'Refresh',
              icon: 'i-lucide-refresh-cw',
              color: 'neutral',
              variant: 'soft',
              onSelect: refreshAll
            }
          ]"
        />
      </template>
      <DashboardSectionState
        v-if="membershipPending"
        state="loading"
        title="Loading credit pricing context"
        description="Checking membership before showing member or non-member purchase guidance."
      />
      <DashboardSectionState
        v-else-if="membershipError"
        state="error"
        title="Could not verify membership"
        description="Credit purchases are disabled rather than falling back to guest pricing."
        show-retry
        @retry="refreshMembership"
      />
      <div
        v-else
        class="space-y-4"
      >
        <DashboardDismissibleIntro
          v-if="!hasActiveMembership"
          storage-key="credits-guest-intro"
          color="warning"
          icon="i-lucide-wallet-cards"
          :title="nonMemberCreditsTitle"
          :description="nonMemberCreditsDescription"
        >
          <template #actions>
            <UButton
              size="xs"
              to="/dashboard/book"
            >
              Book first
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :to="membershipState === 'past_due' ? '/dashboard/profile' : '/dashboard/membership'"
            >
              {{ membershipState === 'past_due' ? 'Review billing' : membershipState === 'pending_checkout' ? 'Finish checkout' : 'Compare memberships' }}
            </UButton>
          </template>
        </DashboardDismissibleIntro>

        <DashboardDismissibleIntro
          v-else
          storage-key="credits-member-intro"
          color="info"
          icon="i-lucide-wallet-cards"
          title="Buying extra credits"
          description="Use this page to review your balance, buy top-off credits, and see credit history. Top-off credits are useful when a booking needs more than your current monthly plan bank."
        >
          <template #actions>
            <UButton
              size="xs"
              to="/dashboard/book"
            >
              Book studio
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              to="/dashboard/referrals"
            >
              Referral code
            </UButton>
          </template>
        </DashboardDismissibleIntro>

        <UCard>
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="text-xs text-dimmed uppercase tracking-wide">
                  Total credits
                </div>
                <div class="mt-1 text-3xl font-semibold">
                  <span
                    v-if="!balanceError && !creditSummaryError"
                    :class="displayedCreditBalance < 0 ? 'text-error' : ''"
                  >
                    {{ formatCredits(displayedCreditBalance) }}
                  </span>
                  <span
                    v-else
                    class="text-dimmed"
                  >—</span>
                </div>
                <div class="mt-1 text-xs text-dimmed">
                  Plan bank: {{ formatCredits(creditSummary?.bankBalance ?? 0) }}
                  <span v-if="creditSummary"> / {{ formatCredits(creditSummary.maxBank) }}</span>
                  · Top-off: {{ formatCredits(creditSummary?.topoffBalance ?? 0) }}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-gift"
                  to="/dashboard/referrals"
                >
                  Referrals
                </UButton>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-calendar-plus"
                  to="/dashboard/book"
                >
                  Book studio
                </UButton>
              </div>
            </div>

            <p
              v-if="creditSummary"
              class="text-xs text-dimmed"
            >
              Plan credits expire after {{ creditSummary.membershipCreditExpiryDays }} days.
              Top-off credits expire after {{ creditSummary.topoffCreditExpiryDays }} days.
            </p>

            <AppAlert
              v-if="balanceError || creditSummaryError"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              title="Credit balance unavailable"
              description="The displayed fallback is not confirmation of a zero balance. Retry before making a purchase decision."
            >
              <template #actions>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  @click="refreshBalance(); refreshCreditSummary()"
                >
                  Retry balance
                </UButton>
              </template>
            </AppAlert>

            <AppAlert
              v-else-if="displayedCreditBalance < 0"
              color="error"
              variant="soft"
              icon="i-lucide-circle-minus"
              title="Credit balance below zero"
              :description="`Your balance is ${formatCredits(displayedCreditBalance)} credits. New credits first cover this negative balance.`"
            />

            <AppAlert
              v-if="creditSummary?.overCap"
              color="warning"
              variant="soft"
              icon="i-lucide-alert-triangle"
              title="Plan bank is over cap"
              description="New plan credits are paused until your plan bank drops back under cap."
            />

            <AppAlert
              v-else-if="creditSummary?.atCap"
              color="info"
              variant="soft"
              icon="i-lucide-circle-check-big"
              title="Plan bank is at cap"
              description="New plan-credit minting is paused until your plan bank drops under cap."
            />

            <AppAlert
              v-if="creditSummary?.expiringSoonCredits && creditSummary.expiringSoonCredits > 0"
              color="warning"
              variant="soft"
              icon="i-lucide-timer"
              :title="`${formatCredits(creditSummary.expiringSoonCredits)} credits expiring soon`"
              :description="`Use expiring credits by ${formatDateLabel(creditSummary.expiringSoonAt) ?? 'this week'}.`"
            />
          </div>
        </UCard>

        <div
          class="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Credit sections"
        >
          <UButton
            id="credits-tab-buy"
            role="tab"
            aria-controls="credits-panel-buy"
            :aria-selected="activeCreditsTab === 'buy'"
            size="sm"
            :color="activeCreditsTab === 'buy' ? 'primary' : 'neutral'"
            :variant="activeCreditsTab === 'buy' ? 'solid' : 'soft'"
            icon="i-lucide-shopping-cart"
            @click="activeCreditsTab = 'buy'"
          >
            Buy credits
          </UButton>
          <UButton
            id="credits-tab-history"
            role="tab"
            aria-controls="credits-panel-history"
            :aria-selected="activeCreditsTab === 'history'"
            size="sm"
            :color="activeCreditsTab === 'history' ? 'primary' : 'neutral'"
            :variant="activeCreditsTab === 'history' ? 'solid' : 'soft'"
            icon="i-lucide-history"
            @click="activeCreditsTab = 'history'"
          >
            Credit history
          </UButton>
        </div>

        <UCard
          v-if="activeCreditsTab === 'buy'"
          id="credits-panel-buy"
          role="tabpanel"
          aria-labelledby="credits-tab-buy"
        >
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs text-dimmed uppercase tracking-wide">
                  Buy credits
                </div>
                <div class="mt-1 text-sm text-dimmed">
                  <template v-if="hasActiveMembership">
                    Top-off credits can be purchased anytime while membership is active.
                  </template>
                  <template v-else>
                    Guest bookings consume credits at the current guest rate. Purchased credits expire after {{ creditSummary?.topoffCreditExpiryDays ?? 30 }} days.
                  </template>
                </div>
                <div
                  v-if="hasSavedCardOnFile"
                  class="mt-1 text-xs text-dimmed"
                >
                  A confirmation appears before any saved card is charged.
                </div>
              </div>
            </div>

            <div
              v-if="topupClaimingFromRoute"
              class="text-xs text-dimmed"
            >
              Finalizing your recent credit payment…
            </div>

            <AppAlert
              v-if="paymentError"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :title="paymentError"
            />

            <UFormField label="Promo code (optional)">
              <UInput
                v-model="promoCode"
                placeholder="SPRING20"
                class="max-w-xs"
              />
            </UFormField>

            <div
              v-if="topupOptionsPending"
              class="text-sm text-dimmed"
            >
              Loading available top-up options…
            </div>

            <DashboardSectionState
              v-else-if="topupOptionsError"
              state="error"
              title="Could not load credit options"
              description="No empty purchase state was assumed."
              show-retry
              @retry="refreshTopupOptions"
            />

            <div
              v-else-if="!canBuyTopoff"
              class="text-sm text-dimmed"
            >
              Credit purchases are currently unavailable.
            </div>

            <div
              v-else-if="topupOptions?.length"
              class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
            >
              <div
                v-for="option in topupOptions ?? []"
                :key="option.key"
                class="rounded-xl border border-default p-3"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="font-medium">
                    {{ option.label }}
                  </div>
                  <div class="text-xs text-dimmed">
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
                  :disabled="topupLoadingKey !== null || topupClaimingFromRoute || paymentSubmitting"
                  @click="startTopup(option.key)"
                >
                  Buy {{ option.credits }} credit{{ option.credits === 1 ? '' : 's' }}
                </UButton>
              </div>
            </div>

            <div
              v-else
              class="text-sm text-dimmed"
            >
              No credit top-up options are active right now.
            </div>
          </div>
        </UCard>

        <UCard
          v-else
          id="credits-panel-history"
          role="tabpanel"
          aria-labelledby="credits-tab-history"
        >
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

          <DashboardSectionState
            v-if="ledgerPending"
            class="mt-4"
            state="loading"
            title="Loading credit history"
          />
          <DashboardSectionState
            v-else-if="ledgerError"
            class="mt-4"
            state="error"
            title="Could not load credit history"
            description="No empty history state was assumed."
            show-retry
            @retry="refreshLedger"
          />
          <DashboardSectionState
            v-else-if="!ledger?.length"
            class="mt-4"
            state="empty"
            title="No credit activity yet"
          />

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
    </DashboardPageScaffold>

    <UModal
      v-model:open="savedCardConfirmOpen"
      title="Confirm saved-card charge"
      description="Review the purchase amount and saved card before Square processes the payment."
      :dismissible="!paymentSubmitting"
    >
      <template #content>
        <UCard v-if="defaultSavedCard && pendingTopupToken">
          <template #header>
            <h3 class="text-base font-semibold">
              Confirm saved-card charge
            </h3>
          </template>
          <div class="space-y-3 text-sm">
            <p class="text-dimmed">
              Confirm the amount and card before Square processes this purchase.
            </p>
            <div class="rounded-lg border border-default p-3 space-y-2">
              <div class="flex justify-between gap-3">
                <span class="text-dimmed">Purchase</span>
                <span class="font-medium">{{ pendingTopupLabel }}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-dimmed">Amount</span>
                <span class="font-medium">{{ formatPrice(pendingTopupAmountCents, pendingTopupCurrency) }}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span class="text-dimmed">Card</span>
                <span class="font-medium">{{ defaultSavedCard.brand ?? 'Card' }} •••• {{ defaultSavedCard.last4 ?? '----' }}</span>
              </div>
            </div>
          </div>
          <template #footer>
            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="paymentSubmitting"
                @click="savedCardConfirmOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                :disabled="paymentSubmitting"
                @click="useAnotherCardForTopup"
              >
                Use another card
              </UButton>
              <UButton
                :loading="paymentSubmitting"
                @click="confirmSavedCardTopup"
              >
                Charge {{ formatPrice(pendingTopupAmountCents, pendingTopupCurrency) }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <SquareCardPaymentModal
      v-model:open="paymentModalOpen"
      instance-key="credits-topup"
      title="Secure card payment"
      :description="`Square will securely process this ${pendingTopupLabel.toLowerCase()} purchase.`"
      :amount-cents="pendingTopupAmountCents"
      :currency="pendingTopupCurrency"
      confirm-label="Pay now"
      :busy="paymentSubmitting"
      :error-message="paymentError"
      @confirm="confirmTopupPayment"
      @clear-error="paymentError = null"
    />
  </div>
</template>
