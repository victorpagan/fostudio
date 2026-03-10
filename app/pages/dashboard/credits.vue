<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const router = useRouter()
const toast = useToast()

type MembershipRow = {
  status: string | null
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

const { data: membership } = await useAsyncData('dash:credits:membership', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as MembershipRow | null
})

const hasActiveMembership = computed(() => (membership.value?.status ?? '').toLowerCase() === 'active')

const { data: balance, refresh: refreshBalance } = await useAsyncData('dash:credits:balance', async () => {
  if (!user.value) return 0
  const { data, error } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return asNumber(data?.balance)
}, { watch: [user, hasActiveMembership] })

const { data: ledger, refresh: refreshLedger } = await useAsyncData('dash:credits:ledger', async () => {
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

const { data: topupOptions, refresh: refreshTopupOptions, pending: topupOptionsPending } = await useAsyncData('dash:credits:topups', async () => {
  if (!user.value) return []
  const res = await $fetch<{ options: CreditTopupOption[] }>('/api/credits/topup/options')
  return res?.options ?? []
}, { watch: [user, hasActiveMembership] })

const { data: creditSummary, refresh: refreshCreditSummary } = await useAsyncData('dash:credits:summary', async () => {
  if (!user.value) return null
  const res = await $fetch<{ summary: CreditSummary | null }>('/api/credits/summary')
  return res.summary
}, { watch: [user, hasActiveMembership] })

const displayedCreditBalance = computed(() => creditSummary.value?.totalBalance ?? balance.value ?? 0)
const canBuyTopoff = computed(() => creditSummary.value?.canBuyTopoff ?? true)

const topupLoadingKey = ref<string | null>(null)
const topupClaimInFlight = ref(false)
const topupClaimingFromRoute = ref(false)
const dashboardHydrated = ref(false)

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

async function refreshAll() {
  await Promise.all([
    refreshBalance(),
    refreshCreditSummary(),
    refreshLedger(),
    refreshTopupOptions()
  ])
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
    <UDashboardPanel
      id="credits"
      class="min-h-0 flex-1"
    >
      <template #header>
        <UDashboardNavbar
          title="Credits"
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
        <ClientOnly>
          <div class="p-4 space-y-4">
            <UAlert
              v-if="!hasActiveMembership"
              color="warning"
              variant="soft"
              icon="i-lucide-badge-x"
              title="No active membership"
              description="You can still use unexpired credits, but top-up purchases are locked until membership is active."
            />

            <UCard>
              <div class="space-y-3">
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <div class="text-xs text-dimmed uppercase tracking-wide">
                      Total credits
                    </div>
                    <div class="mt-1 text-3xl font-semibold">
                      {{ formatCredits(displayedCreditBalance) }}
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
                      icon="i-lucide-users"
                      to="/dashboard/membership"
                    >
                      Membership
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

                <UAlert
                  v-if="creditSummary?.overCap"
                  color="warning"
                  variant="soft"
                  icon="i-lucide-alert-triangle"
                  title="Plan bank is over cap"
                  description="New plan credits are paused until your plan bank drops back under cap."
                />

                <UAlert
                  v-else-if="creditSummary?.atCap"
                  color="info"
                  variant="soft"
                  icon="i-lucide-circle-check-big"
                  title="Plan bank is at cap"
                  description="New plan-credit minting is paused until your plan bank drops under cap."
                />

                <UAlert
                  v-if="creditSummary?.expiringSoonCredits && creditSummary.expiringSoonCredits > 0"
                  color="warning"
                  variant="soft"
                  icon="i-lucide-timer"
                  :title="`${formatCredits(creditSummary.expiringSoonCredits)} credits expiring soon`"
                  :description="`Use expiring credits by ${formatDateLabel(creditSummary.expiringSoonAt) ?? 'this week'}.`"
                />
              </div>
            </UCard>

            <UCard>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-xs text-dimmed uppercase tracking-wide">
                      Buy credits
                    </div>
                    <div class="mt-1 text-sm text-dimmed">
                      Top-off credits can be purchased anytime while membership is active.
                    </div>
                  </div>
                </div>

                <div
                  v-if="topupClaimingFromRoute"
                  class="text-xs text-dimmed"
                >
                  Finalizing your recent credit payment…
                </div>

                <div
                  v-if="topupOptionsPending"
                  class="text-sm text-dimmed"
                >
                  Loading available top-up options…
                </div>

                <div
                  v-else-if="!canBuyTopoff || !hasActiveMembership"
                  class="text-sm text-dimmed"
                >
                  Top-off purchases are currently unavailable without an active membership.
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
                      :disabled="topupLoadingKey !== null || topupClaimingFromRoute"
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
          <template #fallback>
            <div class="p-4 text-sm text-dimmed">
              Loading credits…
            </div>
          </template>
        </ClientOnly>
      </template>
    </UDashboardPanel>
  </div>
</template>
