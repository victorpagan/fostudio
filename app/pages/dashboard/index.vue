<script setup lang="ts">
import { formatMembershipTierLabel } from '~~/app/utils/membershipTierLabel'
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin } = useCurrentUser()

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

type WaiverDashboardState = {
  status: 'current' | 'expired' | 'missing' | 'stale_version'
  renewalNeeded: boolean
  latestSignature: {
    signedAt: string
    expiresAt: string
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

// Membership
const {
  data: membership,
  pending: membershipPending,
  error: membershipError,
  refresh: refreshMembership
} = await useAsyncData('dash:home:membership', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('id, tier, cadence, status, created_at, current_period_end, canceled_at, membership_source, billing_provider, manual_expires_at')
    .eq('user_id', user.value.sub)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
})

// Real credit balance from the credit_balance view
const {
  data: creditBalance,
  pending: creditsPending,
  error: creditsError,
  refresh: refreshCredits
} = await useAsyncData('dash:home:credits', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data?.balance ?? null
})

// Upcoming bookings count for quick display
const {
  data: upcomingCount,
  pending: upcomingPending,
  error: upcomingError,
  refresh: refreshUpcoming
} = await useAsyncData('dash:home:upcoming', async () => {
  if (!user.value) return 0
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.value.sub)
    .gte('start_time', new Date().toISOString())
    .in('status', ['confirmed', 'requested', 'pending_payment'])
  if (error) throw error
  return count ?? 0
})

const {
  data: holdSummary,
  pending: holdsPending,
  error: holdsError,
  refresh: refreshHolds
} = await useAsyncData('dash:home:holds', async () => {
  if (!user.value) return null
  return await $fetch<HoldSummary>('/api/holds/summary')
})

const {
  data: waiverState,
  pending: waiverPending,
  error: waiverError,
  refresh: refreshWaiver
} = await useAsyncData('dash:home:waiver', async () => {
  if (!user.value) return null
  return await $fetch<WaiverDashboardState>('/api/waiver/current')
})

const {
  data: doorCodeState,
  pending: doorCodePending,
  error: doorCodeError,
  refresh: refreshDoorCode
} = await useAsyncData('dash:home:door-code', async () => {
  if (!user.value) return null
  return await $fetch<DoorCodeState>('/api/membership/door-code')
})

const membershipState = computed(() => {
  return resolveMembershipUiState(membership.value)
})
const membershipResolved = computed(() => !membershipPending.value && !membershipError.value)
const isGuestAccount = computed(() => membershipResolved.value && membershipState.value === 'none' && !isAdmin.value)
const isManualMembership = computed(() => {
  const row = membership.value as { membership_source?: string | null, billing_provider?: string | null } | null
  return (row?.membership_source ?? row?.billing_provider ?? '').toLowerCase() === 'manual'
})
const membershipExpired = computed(() => {
  if (membershipState.value !== 'inactive') return false
  const row = membership.value as { manual_expires_at?: string | null, current_period_end?: string | null } | null
  const value = row?.manual_expires_at ?? row?.current_period_end
  if (!value) return false
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time <= Date.now()
})

const { data: subscriptionState, error: subscriptionStateError, refresh: refreshSubscriptionState } = await useAsyncData('dash:home:subscription-state', async () => {
  if (!user.value) return null
  return await $fetch<{
    pendingSwap: {
      effectiveDate: string | null
      target: {
        displayName: string | null
        tier: string | null
        cadence: string | null
      } | null
    } | null
    pendingCancel: {
      effectiveDate: string | null
    } | null
  }>('/api/membership/subscription-state')
})

const tierLabel = computed(() => {
  if (!membership.value) return null
  if (!['active', 'past_due', 'pending_checkout'].includes(membershipState.value)) return null
  const tierName = formatMembershipTierLabel(membership.value.tier)
  return [tierName, membership.value.cadence].filter(Boolean).join(' · ')
})

function formatCadence(cadence: string | null | undefined) {
  if (cadence === 'daily') return 'Daily'
  if (cadence === 'weekly') return 'Weekly'
  if (cadence === 'monthly') return 'Monthly'
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return cadence ?? '—'
}

function formatExactDate(iso: string | null | undefined) {
  if (!iso) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toISOString().slice(0, 10)
}

const waiverStatusLabel = computed(() => {
  const status = waiverState.value?.status
  if (status === 'current') return 'current'
  if (status === 'expired') return 'expired'
  if (status === 'stale_version') return 'needs re-sign'
  return 'missing'
})

const waiverStatusColor = computed(() => {
  const status = waiverState.value?.status
  if (status === 'current') return 'success'
  if (status === 'expired') return 'warning'
  return 'error'
})

const waiverStatusDescription = computed(() => {
  const status = waiverState.value?.status
  if (status === 'current') return 'Waiver is valid for booking.'
  if (status === 'expired') return 'Waiver expired. Re-sign required.'
  if (status === 'stale_version') return 'New waiver version requires a re-sign.'
  return 'No waiver signature on file yet.'
})

const doorCodeRequestPending = computed(() =>
  String(doorCodeState.value?.latestRequest?.status ?? '').toLowerCase() === 'pending'
)

const pendingSwapSummary = computed(() => {
  const pendingSwap = subscriptionState.value?.pendingSwap
  if (!pendingSwap || !membership.value) return null

  const currentTier = formatMembershipTierLabel(membership.value.tier) ?? 'current plan'
  const currentCadence = formatCadence(membership.value.cadence)
  const targetName = pendingSwap.target?.displayName
    ?? formatMembershipTierLabel(pendingSwap.target?.tier)
    ?? 'new plan'
  const targetCadence = formatCadence(pendingSwap.target?.cadence)
  const effectiveDate = formatExactDate(pendingSwap.effectiveDate) ?? 'next billing cycle'

  return {
    title: 'Plan switch pending',
    detail: `${currentTier} (${currentCadence}) remains active until ${effectiveDate}. Then ${targetName} (${targetCadence}) starts.`
  }
})

const pendingCancelSummary = computed(() => {
  const pendingCancel = subscriptionState.value?.pendingCancel
  if (!pendingCancel) return null
  const effectiveDate = formatExactDate(pendingCancel.effectiveDate) ?? 'the current billing cycle end'
  return `Your membership is scheduled to cancel on ${effectiveDate}.`
})
</script>

<template>
  <DashboardPageScaffold
    panel-id="home"
    title="Dashboard"
  >
    <div class="w-full space-y-4">
      <!-- Admin bypass notice -->
      <AppAlert
        v-if="isAdmin"
        color="primary"
        variant="soft"
        title="Admin access"
        description="You are viewing the dashboard as an admin. Membership guards are bypassed."
      />
      <DashboardSectionState
        v-else-if="membershipPending"
        state="loading"
        title="Loading account status"
        description="Checking membership before choosing member or guest dashboard guidance."
      />
      <DashboardSectionState
        v-else-if="membershipError"
        state="error"
        title="Could not load membership"
        description="Your account was not treated as a guest. Retry to restore membership-aware actions."
        show-retry
        @retry="refreshMembership"
      />
      <DashboardDismissibleIntro
        v-else-if="isGuestAccount"
        storage-key="dashboard-guest-intro"
        color="warning"
        icon="i-lucide-badge-alert"
        title="You're set up as a guest"
        description="Guests can book studio time with premium credits between 11am and 7pm. Start by choosing a time on the booking calendar or buying credits; checkout can cover only the credit shortfall if needed."
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
            to="/dashboard/credits"
          >
            Buy credits
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            to="/dashboard/membership"
          >
            Compare memberships
          </UButton>
        </template>
      </DashboardDismissibleIntro>
      <DashboardDismissibleIntro
        v-else-if="membershipState === 'active'"
        storage-key="dashboard-member-intro"
        color="success"
        icon="i-lucide-badge-check"
        :title="isManualMembership ? 'Assigned membership active' : 'Membership active'"
        :description="tierLabel ? `Plan: ${tierLabel}` : 'Welcome back!'"
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
            to="/dashboard/credits"
          >
            Review credits
          </UButton>
        </template>
      </DashboardDismissibleIntro>
      <AppAlert
        v-else-if="membershipState === 'past_due'"
        color="error"
        variant="soft"
        icon="i-lucide-credit-card"
        title="Membership payment is past due"
        description="Member booking and hold benefits are paused until billing is restored. Your plan and account history remain visible."
      >
        <template #actions>
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            to="/dashboard/profile"
          >
            Review billing
          </UButton>
        </template>
      </AppAlert>
      <AppAlert
        v-else-if="membershipState === 'pending_checkout'"
        color="warning"
        variant="soft"
        icon="i-lucide-clock"
        title="Membership checkout incomplete"
        description="Payment has not activated this membership yet. Finish checkout or refresh the status before relying on member benefits."
      >
        <template #actions>
          <UButton
            size="xs"
            to="/dashboard/membership"
          >
            Finish membership setup
          </UButton>
        </template>
      </AppAlert>
      <AppAlert
        v-else
        color="warning"
        variant="soft"
        icon="i-lucide-badge-x"
        :title="membershipExpired ? 'Membership expired' : 'Membership ended'"
        description="Member benefits are no longer active. Existing credits and booking history remain available under current account rules."
      >
        <template #actions>
          <UButton
            size="xs"
            to="/dashboard/membership"
          >
            Compare memberships
          </UButton>
        </template>
      </AppAlert>
      <AppAlert
        v-if="pendingCancelSummary"
        class="mt-3"
        color="warning"
        variant="soft"
        icon="i-lucide-calendar-x"
        title="Cancellation scheduled"
        :description="pendingCancelSummary"
      />
      <AppAlert
        v-if="membershipState === 'active' && subscriptionStateError"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        title="Subscription details unavailable"
        description="The stored membership remains visible, but pending billing changes could not be verified."
      >
        <template #actions>
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            @click="() => refreshSubscriptionState()"
          >
            Retry
          </UButton>
        </template>
      </AppAlert>
    </div>
    <!-- Stat cards -->
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <!-- Credits + holds card -->
      <UCard>
        <div class="text-xs text-dimmed uppercase tracking-wide">
          Credits and holds
        </div>
        <div class="mt-3 grid grid-cols-2 gap-3">
          <div class="rounded-lg border border-default bg-elevated/60 p-3">
            <div class="text-[11px] uppercase tracking-wide text-dimmed">
              Credits
            </div>
            <div class="mt-1 text-3xl font-semibold tabular-nums">
              <UIcon
                v-if="creditsPending"
                name="i-lucide-loader-circle"
                class="size-5 animate-spin text-dimmed"
              />
              <UButton
                v-else-if="creditsError"
                size="xs"
                color="neutral"
                variant="soft"
                @click="() => refreshCredits()"
              >
                Retry
              </UButton>
              <span
                v-else-if="creditBalance !== null"
                :class="Number(creditBalance) < 0 ? 'text-error' : ''"
              >{{ creditBalance }}</span>
              <span
                v-else
                class="text-dimmed text-xl"
              >—</span>
            </div>
          </div>
          <div class="rounded-lg border border-default bg-elevated/60 p-3">
            <div class="text-[11px] uppercase tracking-wide text-dimmed">
              Holds left
            </div>
            <div class="mt-1 text-3xl font-semibold tabular-nums">
              <UIcon
                v-if="holdsPending"
                name="i-lucide-loader-circle"
                class="size-5 animate-spin text-dimmed"
              />
              <UButton
                v-else-if="holdsError"
                size="xs"
                color="neutral"
                variant="soft"
                @click="() => refreshHolds()"
              >
                Retry
              </UButton>
              <template v-else>
                {{ holdSummary?.includedHoldsRemaining ?? 0 }}
              </template>
            </div>
          </div>
        </div>
        <div class="mt-3 text-xs text-dimmed">
          <template v-if="creditsError || holdsError">
            One or more balances are unavailable. No zero balance was assumed.
          </template>
          <template v-else-if="creditBalance === null">
            Credits appear once your first invoice is paid.
          </template>
          <template v-else>
            Paid hold balance: {{ holdSummary?.paidHoldBalance ?? 0 }}
          </template>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            to="/dashboard/credits"
          >
            Manage credits
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            to="/dashboard/bookings?tab=holds"
          >
            Manage holds
          </UButton>
        </div>
        <div
          v-if="pendingSwapSummary"
          class="mt-3 rounded-lg border border-default bg-elevated/60 p-2"
        >
          <div class="text-xs font-medium">
            {{ pendingSwapSummary.title }}
          </div>
          <div class="mt-1 text-xs text-dimmed">
            {{ pendingSwapSummary.detail }}
          </div>
        </div>
      </UCard>

      <!-- Upcoming bookings card -->
      <UCard>
        <div class="text-xs text-dimmed uppercase tracking-wide">
          Upcoming
        </div>
        <div class="mt-2 text-4xl font-semibold tabular-nums">
          <UIcon
            v-if="upcomingPending"
            name="i-lucide-loader-circle"
            class="size-6 animate-spin text-dimmed"
          />
          <UButton
            v-else-if="upcomingError"
            size="xs"
            color="neutral"
            variant="soft"
            @click="() => refreshUpcoming()"
          >
            Retry
          </UButton>
          <template v-else>
            {{ upcomingCount ?? 0 }}
          </template>
        </div>
        <div class="mt-1.5 text-xs text-dimmed">
          <template v-if="upcomingError">
            Booking count unavailable; zero was not assumed.
          </template>
          <template v-else>
            {{ upcomingCount === 1 ? 'upcoming booking' : 'upcoming bookings' }}
          </template>
        </div>
        <div class="mt-4 flex flex-col gap-2">
          <UButton
            to="/dashboard/book"
            size="sm"
          >
            Book studio
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            to="/dashboard/bookings"
            size="sm"
          >
            My bookings
          </UButton>
        </div>
      </UCard>

      <UCard>
        <div class="text-xs text-dimmed uppercase tracking-wide">
          Waiver
        </div>
        <div class="mt-2 text-4xl font-semibold tabular-nums">
          <UIcon
            :name="waiverPending ? 'i-lucide-loader-circle' : waiverError ? 'i-lucide-circle-alert' : waiverState?.status === 'current' ? 'i-lucide-shield-check' : 'i-lucide-file-warning'"
            class="size-9"
            :class="waiverPending ? 'animate-spin' : ''"
          />
        </div>
        <div class="mt-1.5">
          <UBadge
            :color="waiverError ? 'error' : waiverStatusColor"
            variant="soft"
            size="sm"
          >
            {{ waiverPending ? 'loading' : waiverError ? 'unavailable' : waiverStatusLabel }}
          </UBadge>
        </div>
        <div class="mt-1.5 text-xs text-dimmed">
          {{ waiverError ? 'Waiver status could not be loaded.' : waiverStatusDescription }}
        </div>
        <div class="mt-4">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            :to="waiverError ? undefined : '/dashboard/waiver'"
            @click="waiverError && refreshWaiver()"
          >
            {{ waiverError ? 'Retry' : waiverState?.status === 'current' ? 'View waiver' : 'Review and sign' }}
          </UButton>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs text-dimmed uppercase tracking-wide">
              Door code
            </div>
            <div class="mt-2 font-mono text-3xl font-semibold tracking-[0.16em]">
              {{ doorCodePending ? '------' : doorCodeError ? 'Unavailable' : doorCodeState?.doorCode ?? 'Not assigned' }}
            </div>
          </div>
          <UIcon
            name="i-lucide-key-round"
            class="size-8 text-dimmed"
          />
        </div>
        <div class="mt-1.5">
          <UBadge
            v-if="!doorCodeError && doorCodeRequestPending"
            color="warning"
            variant="soft"
            size="sm"
          >
            Change requested
          </UBadge>
          <UBadge
            v-else-if="!doorCodeError"
            color="neutral"
            variant="soft"
            size="sm"
          >
            Account code
          </UBadge>
        </div>
        <div class="mt-1.5 text-xs text-dimmed">
          {{ doorCodeError ? 'Door code status could not be loaded.' : 'Your account code works during eligible booking access windows.' }}
        </div>
        <div class="mt-4">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            :to="doorCodeError ? undefined : '/dashboard/door-code'"
            @click="doorCodeError && refreshDoorCode()"
          >
            {{ doorCodeError ? 'Retry' : 'Manage door code' }}
          </UButton>
        </div>
      </UCard>
    </div>

    <div class="max-w-xl">
      <UCard>
        <div class="text-xs text-dimmed uppercase tracking-wide mb-3">
          Account
        </div>
        <div class="flex flex-col gap-2">
          <UButton
            color="neutral"
            variant="soft"
            to="/dashboard/membership"
            icon="i-lucide-badge-check"
            class="justify-start"
          >
            Membership details
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            to="/dashboard/profile"
            icon="i-lucide-user"
            class="justify-start"
          >
            Edit profile
          </UButton>
        </div>
      </UCard>
    </div>
  </DashboardPageScaffold>
</template>
