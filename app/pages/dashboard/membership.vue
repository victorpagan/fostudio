<script setup lang="ts">
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
  delta: number
  reason: string
  external_ref: string | null
  created_at: string
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

// ── Current membership ─────────────────────────────────────────────────────
const { data: membership, refresh } = await useAsyncData('dash:membership', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('id, tier, cadence, status, created_at, square_plan_variation_id')
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
  return data?.balance ?? 0
}, { watch: [user, membershipState] })

const { data: ledger, refresh: refreshLedger } = await useAsyncData('dash:membership:credits:ledger', async () => {
  if (!user.value || !hasActiveMembership.value) return []
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('id,delta,reason,external_ref,created_at')
    .eq('user_id', user.value.sub)
    .order('created_at', { ascending: false })
    .limit(25)
  if (error) throw error
  return (data ?? []) as LedgerRow[]
}, { watch: [user, membershipState] })

const { data: tierCatalog } = await useAsyncData('dash:tierCatalog', async () => {
  if (!showCatalog.value) return []
  const res = await $fetch<{ tiers: CatalogTier[] }>('/api/membership/catalog')
  return res?.tiers ?? []
}, { watch: [showCatalog] })

const { data: topupOptions, refresh: refreshTopupOptions } = await useAsyncData('dash:membership:topup-options', async () => {
  if (!user.value || !hasActiveMembership.value) return []
  const res = await $fetch<{ options: CreditTopupOption[] }>('/api/credits/topup/options')
  return res?.options ?? []
}, { watch: [user, membershipState] })

function goCheckout(tierId: string, cadence: string) {
  router.push(`/checkout?tier=${tierId}&cadence=${cadence}&returnTo=/dashboard/membership`)
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

function formatDelta(value: number) {
  return value > 0 ? `+${value}` : `${value}`
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

function formatSaleWindow(start: string | null, end: string | null) {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const from = start ? new Date(start).toLocaleDateString('en-US', options) : null
  const to = end ? new Date(end).toLocaleDateString('en-US', options) : null

  if (from && to) return `${from} to ${to}`
  if (from) return `Starts ${from}`
  if (to) return `Ends ${to}`
  return null
}

function formatCadence(c: string | null) {
  switch (c) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly (3 months)'
    case 'annual': return 'Annual'
    default: return c ?? '—'
  }
}

function memberSince(createdAt: string | null) {
  if (!createdAt) return '—'
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function formatStatus(status: string | null | undefined) {
  return status || '—'
}

function formatPeakCredits(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}

const topupLoadingKey = ref<string | null>(null)
const topupClaiming = ref(false)

async function refreshAll() {
  await Promise.all([
    refresh(),
    refreshTier(),
    refreshVariations(),
    refreshBalance(),
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

async function claimTopupFromRoute() {
  const topupToken = typeof route.query.topup === 'string' ? route.query.topup : null
  if (!topupToken || topupClaiming.value) return

  topupClaiming.value = true
  try {
    const res = await $fetch<{ status: 'processed', creditsAdded?: number, newBalance?: number | null }>('/api/credits/topup/claim', {
      method: 'POST',
      body: { token: topupToken }
    })

    const added = typeof res.creditsAdded === 'number' ? `${res.creditsAdded} credits added.` : 'Credits updated.'
    const balanceLine = res.newBalance !== null && res.newBalance !== undefined ? ` New balance: ${res.newBalance}.` : ''
    toast.add({
      title: 'Top-up complete',
      description: `${added}${balanceLine}`,
      color: 'success'
    })

    await refreshAll()
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Top-up pending',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Payment confirmation is still syncing.',
      color: 'warning'
    })
  } finally {
    topupClaiming.value = false
    if (route.query.topup) {
      const nextQuery = { ...route.query }
      delete nextQuery.topup
      router.replace({ query: nextQuery })
    }
  }
}

onMounted(async () => {
  await claimTopupFromRoute()
})
</script>

<template>
  <UDashboardPanel id="membership">
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
                    <span>Equipment holds</span>
                    <UBadge
                      :color="t.holds_included ? 'success' : 'neutral'"
                      variant="soft"
                      size="xs"
                    >
                      {{ t.holds_included ? 'Included' : 'Extra' }}
                    </UBadge>
                  </li>
                </ul>
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
                      v-if="plan.discount_label"
                      color="success"
                      variant="soft"
                      size="xs"
                      class="ml-1"
                    >
                      {{ plan.discount_label }}
                    </UBadge>
                  </div>
                  <UButton
                    size="xs"
                    @click="goCheckout(t.id, plan.cadence)"
                  >
                    {{ formatPrice(plan.price_cents) }}/mo
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
                    <span>{{ formatPrice(currentVariation?.price_cents ?? null) }}/mo</span>
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
                    <span class="text-dimmed">Equipment holds</span>
                    <UBadge
                      :color="tier?.holds_included ? 'success' : 'neutral'"
                      variant="soft"
                      size="sm"
                    >
                      {{ tier?.holds_included ? 'Included' : 'Extra' }}
                    </UBadge>
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
                      v-if="v.discount_label"
                      color="success"
                      size="xs"
                      variant="soft"
                    >
                      {{ v.discount_label }}
                    </UBadge>
                  </div>
                  <div class="text-dimmed mt-1">
                    {{ formatPrice(v.price_cents) }}/mo · {{ v.credits_per_month }} cr/mo
                  </div>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Actions -->
          <UCard>
            <div class="text-sm font-medium mb-3">
              Manage membership
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-arrow-up-circle"
                @click="goCheckout(membership?.tier ?? 'creator', membership?.cadence ?? 'monthly')"
              >
                Change plan
              </UButton>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-external-link"
                target="_blank"
              >
                Manage billing (Square)
              </UButton>
            </div>
            <p class="mt-3 text-xs text-dimmed">
              Billing is managed via Square. Contact us to cancel or change your plan. Cancellations take effect at the end of your billing cycle.
            </p>
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

                <div class="grid gap-2 sm:grid-cols-2">
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
                  v-if="hasActiveMembership && !(topupOptions?.length)"
                  class="text-xs text-dimmed"
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
                      {{ formatLedgerReason(row.reason) }}
                    </div>
                    <div class="mt-1 text-xs text-dimmed">
                      {{ new Date(row.created_at).toLocaleString() }}
                      <span v-if="row.external_ref"> · ref: {{ row.external_ref }}</span>
                    </div>
                  </div>
                  <div
                    class="text-sm font-semibold shrink-0"
                    :class="row.delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
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
</template>
