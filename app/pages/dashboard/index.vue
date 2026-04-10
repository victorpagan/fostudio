<script setup lang="ts">
import { formatMembershipTierLabel } from '~~/app/utils/membershipTierLabel'
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isNotificationsSlideoverOpen } = useDashboard()
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

// Membership
const { data: membership } = await useAsyncData('dash:home:membership', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('id, tier, cadence, status, created_at, current_period_end, canceled_at')
    .eq('user_id', user.value.sub)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
})

// Real credit balance from the credit_balance view
const { data: creditBalance } = await useAsyncData('dash:home:credits', async () => {
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
const { data: upcomingCount } = await useAsyncData('dash:home:upcoming', async () => {
  if (!user.value) return 0
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.value.sub)
    .gte('start_time', new Date().toISOString())
    .in('status', ['confirmed', 'requested'])
  if (error) return 0
  return count ?? 0
})

const { data: holdSummary } = await useAsyncData('dash:home:holds', async () => {
  if (!user.value) return null
  return await $fetch<HoldSummary>('/api/holds/summary')
})

const { data: waiverState } = await useAsyncData('dash:home:waiver', async () => {
  if (!user.value) return null
  return await $fetch<WaiverDashboardState>('/api/waiver/current')
})

const membershipState = computed(() => {
  return resolveMembershipUiState(membership.value)
})

const { data: subscriptionState } = await useAsyncData('dash:home:subscription-state', async () => {
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

const needsMembership = computed(() => membershipState.value !== 'active' && !isAdmin.value)

const membershipCta = computed(() => {
  if (membershipState.value === 'pending_checkout') return { label: 'Finish checkout', to: '/dashboard/memberships' }
  if (['none', 'canceled', 'past_due', 'inactive'].includes(membershipState.value)) return { label: 'Buy membership', to: '/dashboard/memberships' }
  return { label: 'Manage membership', to: '/dashboard/membership' }
})

const headerPrimaryAction = computed(() => {
  if (needsMembership.value) {
    return {
      label: membershipCta.value.label,
      to: membershipCta.value.to,
      icon: 'i-lucide-badge-check'
    }
  }

  return {
    label: 'Book studio',
    to: '/dashboard/book',
    icon: 'i-lucide-calendar-plus'
  }
})

const headerSecondaryActions = computed(() => {
  if (needsMembership.value) return []
  return [{
    label: 'My bookings',
    to: '/dashboard/bookings',
    icon: 'i-lucide-list-checks'
  }]
})

const headerTertiaryActions = computed(() => ([
  {
    label: 'Manage membership',
    to: '/dashboard/membership',
    icon: 'i-lucide-badge-check'
  },
  {
    label: 'Profile',
    to: '/dashboard/profile',
    icon: 'i-lucide-user'
  }
]))

const tierLabel = computed(() => {
  if (!membership.value) return null
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
    <template #right>
      <DashboardActionGroup
        :primary="headerPrimaryAction"
        :secondary="headerSecondaryActions"
        :tertiary="headerTertiaryActions"
      >
        <template #leading>
          <UTooltip
            text="Notifications"
            :shortcuts="['N']"
          >
            <UButton
              color="neutral"
              variant="ghost"
              square
              aria-label="Open notifications"
              @click="isNotificationsSlideoverOpen = true"
            >
              <UChip
                color="error"
                inset
              >
                <UIcon
                  name="i-lucide-bell"
                  class="size-5 shrink-0"
                />
              </UChip>
            </UButton>
          </UTooltip>
        </template>
      </DashboardActionGroup>
    </template>

    <div class="w-full space-y-4">
      <!-- Admin bypass notice -->
      <UAlert
        v-if="isAdmin"
        color="primary"
        variant="soft"
        title="Admin access"
        description="You are viewing the dashboard as an admin. Membership guards are bypassed."
      />
      <!-- Membership CTA for non-members -->
      <UAlert
        v-else-if="needsMembership"
        color="warning"
        variant="soft"
        title="Membership required to book"
        description="Choose a plan (or finish checkout) to access booking and credits."
      >
        <template #actions>
          <UButton
            size="sm"
            :to="membershipCta.to"
          >
            {{ membershipCta.label }}
          </UButton>
        </template>
      </UAlert>
      <!-- Active member welcome -->
      <UAlert
        v-else
        color="success"
        variant="soft"
        title="Membership active"
        :description="tierLabel ? `Plan: ${tierLabel}` : 'Welcome back!'"
      >
        <template #actions>
          <UButton
            size="sm"
            to="/dashboard/book"
          >
            Book studio
          </UButton>
        </template>
      </UAlert>
      <UAlert
        v-if="pendingCancelSummary"
        class="mt-3"
        color="warning"
        variant="soft"
        icon="i-lucide-calendar-x"
        title="Cancellation scheduled"
        :description="pendingCancelSummary"
      />
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
              <span v-if="creditBalance !== null">{{ creditBalance }}</span>
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
              {{ holdSummary?.includedHoldsRemaining ?? 0 }}
            </div>
          </div>
        </div>
        <div class="mt-3 text-xs text-dimmed">
          <template v-if="creditBalance === null">
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
            to="/dashboard/membership#holds"
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
          {{ upcomingCount ?? 0 }}
        </div>
        <div class="mt-1.5 text-xs text-dimmed">
          {{ upcomingCount === 1 ? 'upcoming booking' : 'upcoming bookings' }}
        </div>
        <div class="mt-4 flex flex-col gap-2">
          <UButton
            :disabled="needsMembership"
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
            :name="waiverState?.status === 'current' ? 'i-lucide-shield-check' : 'i-lucide-file-warning'"
            class="size-9"
          />
        </div>
        <div class="mt-1.5">
          <UBadge
            :color="waiverStatusColor"
            variant="soft"
            size="sm"
          >
            {{ waiverStatusLabel }}
          </UBadge>
        </div>
        <div class="mt-1.5 text-xs text-dimmed">
          {{ waiverStatusDescription }}
        </div>
        <div class="mt-4">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            to="/dashboard/waiver"
          >
            {{ waiverState?.status === 'current' ? 'View waiver' : 'Review and sign' }}
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
