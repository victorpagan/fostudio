<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'
import { formatMembershipTierLabel } from '~~/app/utils/membershipTierLabel'
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'

const open = ref(false)
const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin } = useCurrentUser()
const topupRecoveryRunning = useState<boolean>('topup-recovery-running', () => false)
const lastTopupRecoveryAt = useState<number>('topup-recovery-last-at', () => 0)
const dashboardNavProgress = ref(0)

let dashboardProgressTimer: ReturnType<typeof setInterval> | null = null
let dashboardProgressResetTimer: ReturnType<typeof setTimeout> | null = null
let removeDashboardBeforeGuard: (() => void) | null = null
let removeDashboardAfterGuard: (() => void) | null = null
let removeDashboardErrorGuard: (() => void) | null = null

type SidebarMembershipRow = {
  tier: string | null
  cadence: string | null
  status: string | null
  current_period_end: string | null
  canceled_at: string | null
}

const { data: sidebarMembership } = await useAsyncData('dash:sidebar:membership', async () => {
  if (!user.value?.sub) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('tier,cadence,status,current_period_end,canceled_at')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as SidebarMembershipRow | null
}, { watch: [() => user.value?.sub] })

const { data: sidebarCredits } = await useAsyncData('dash:sidebar:credits', async () => {
  if (!user.value?.sub) return null
  const { data, error } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return typeof data?.balance === 'number' ? data.balance : Number(data?.balance ?? 0)
}, { watch: [() => user.value?.sub] })

const { data: sidebarCreditCap } = await useAsyncData('dash:sidebar:credit-cap', async () => {
  const tierId = sidebarMembership.value?.tier
  if (!tierId) return null

  const { data, error } = await supabase
    .from('membership_tiers')
    .select('max_bank')
    .eq('id', tierId)
    .maybeSingle()
  if (error) throw error

  return typeof data?.max_bank === 'number' ? data.max_bank : Number(data?.max_bank ?? 0)
}, { watch: [() => sidebarMembership.value?.tier] })

const sidebarMembershipState = computed(() => resolveMembershipUiState(sidebarMembership.value))

const sidebarTierLabel = computed(() => {
  const row = sidebarMembership.value
  if (!row) return null
  const tierLabel = formatMembershipTierLabel(row.tier)
  const cadence = row.cadence ?? null
  return [tierLabel, cadence].filter(Boolean).join(' · ')
})

const sidebarMembershipCta = computed(() => {
  if (sidebarMembershipState.value === 'active') return { label: 'Manage membership', to: '/dashboard/membership' }
  if (sidebarMembershipState.value === 'pending_checkout') return { label: 'Finish checkout', to: '/dashboard/memberships' }
  return { label: 'Get membership', to: '/dashboard/memberships' }
})

const sidebarStatusLabel = computed(() => sidebarMembershipState.value.replace(/_/g, ' '))

const sidebarStatusColor = computed(() => {
  if (sidebarMembershipState.value === 'active') return 'success'
  if (sidebarMembershipState.value === 'pending_checkout') return 'warning'
  if (sidebarMembershipState.value === 'past_due') return 'error'
  return 'neutral'
})

const showSidebarBalanceCta = computed(() => {
  if (sidebarMembershipState.value !== 'active') return true
  return (sidebarCredits.value ?? 0) <= 0
})

const sidebarCreditsValue = computed(() => Number(sidebarCredits.value ?? 0))
const sidebarMaxBank = computed(() => Number(sidebarCreditCap.value ?? 0))

const sidebarCreditsOverCap = computed(() => {
  if (sidebarMaxBank.value <= 0) return false
  return sidebarCreditsValue.value > sidebarMaxBank.value
})

const sidebarCreditsProgress = computed(() => {
  if (sidebarCreditsOverCap.value) return 100
  if (sidebarMaxBank.value <= 0) return 0
  const ratio = (sidebarCreditsValue.value / sidebarMaxBank.value) * 100
  return Math.max(0, Math.min(100, ratio))
})

const isAdminSidebarMode = computed(() =>
  isAdmin.value && route.path.startsWith('/dashboard/admin')
)

const adminLinks = computed<NavigationMenuItem[]>(() => (isAdmin.value
  ? [
      {
        label: 'Back to Dashboard',
        icon: 'i-lucide-arrow-left',
        to: '/dashboard',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Ops Overview',
        icon: 'i-lucide-layout-dashboard',
        to: '/dashboard/admin',
        exact: true,
        onSelect: () => { open.value = false }
      },
      {
        label: 'Ops Tools',
        icon: 'i-lucide-wrench',
        to: '/dashboard/admin/tools',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Subscriptions',
        icon: 'i-lucide-badge-check',
        to: '/dashboard/admin/subscriptions',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Credits',
        icon: 'i-lucide-wallet-cards',
        to: '/dashboard/admin/credits',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Promo Codes',
        icon: 'i-lucide-ticket-percent',
        to: '/dashboard/admin/promos',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Members',
        icon: 'i-lucide-users',
        to: '/dashboard/admin/members',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Door Codes',
        icon: 'i-lucide-key-round',
        to: '/dashboard/admin/door-codes',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Waiver Templates',
        icon: 'i-lucide-file-signature',
        to: '/dashboard/admin/waiver',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Bookings',
        icon: 'i-lucide-calendar-range',
        to: '/dashboard/admin/bookings',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Calendar Settings',
        icon: 'i-lucide-calendar-clock',
        to: '/dashboard/admin/calendar',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Google Calendar',
        icon: 'i-lucide-calendar-sync',
        to: '/dashboard/admin/google-calendar',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Email',
        icon: 'i-lucide-mail',
        to: '/dashboard/admin/email',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Email Campaigns',
        icon: 'i-lucide-megaphone',
        to: '/dashboard/admin/email-campaigns',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Holds',
        icon: 'i-lucide-package-plus',
        to: '/dashboard/admin/holds',
        onSelect: () => { open.value = false }
      }
    ]
  : []))

const primaryLinks = computed<NavigationMenuItem[]>(() => [
  {
    label: 'Dashboard',
    icon: 'i-lucide-house',
    to: '/dashboard',
    exact: true,
    onSelect: () => { open.value = false }
  },
  {
    label: 'Book Studio',
    icon: 'i-lucide-calendar-plus',
    to: '/dashboard/book',
    onSelect: () => { open.value = false }
  },
  {
    label: 'Bookings',
    icon: 'i-lucide-list-checks',
    to: '/dashboard/bookings',
    onSelect: () => { open.value = false }
  },
  {
    label: 'Membership',
    icon: 'i-lucide-badge-check',
    to: '/dashboard/membership',
    onSelect: () => { open.value = false }
  },
  {
    label: 'Waiver',
    icon: 'i-lucide-file-signature',
    to: '/dashboard/waiver',
    onSelect: () => { open.value = false }
  },
  {
    label: 'Credits',
    icon: 'i-lucide-wallet-cards',
    to: '/dashboard/credits',
    onSelect: () => { open.value = false }
  },
  {
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/dashboard/profile',
    onSelect: () => { open.value = false }
  },
  ...(isAdmin.value
    ? [{
        label: 'Admin',
        icon: 'i-lucide-shield',
        to: '/dashboard/admin',
        onSelect: () => { open.value = false }
      }]
    : [])
])

const sidebarLinks = computed<NavigationMenuItem[]>(() =>
  isAdminSidebarMode.value
    ? adminLinks.value
    : primaryLinks.value
)

const supportLinks = [{
  label: 'Help & Support',
  icon: 'i-lucide-info',
  to: '/contact',
  onSelect: () => { open.value = false }
}] satisfies NavigationMenuItem[]

const searchItems = computed<CommandPaletteItem[]>(() => {
  const all = [...primaryLinks.value, ...adminLinks.value, ...supportLinks]
    .filter(item => typeof item.to === 'string')
  return all.map(item => ({
    label: item.label,
    icon: item.icon,
    to: item.to,
    onSelect: item.onSelect
  }))
})

const groups = computed<CommandPaletteGroup[]>(() => [{
  id: 'links',
  label: 'Go to',
  items: searchItems.value
}])

function formatSidebarCreditValue(value: number) {
  if (!Number.isFinite(value)) return '0'
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function readQueryString(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.trim())
    if (typeof first === 'string' && first.trim()) return first.trim()
  }
  return null
}

function clearDashboardProgressTimers() {
  if (dashboardProgressTimer) {
    clearInterval(dashboardProgressTimer)
    dashboardProgressTimer = null
  }
  if (dashboardProgressResetTimer) {
    clearTimeout(dashboardProgressResetTimer)
    dashboardProgressResetTimer = null
  }
}

function startDashboardProgress() {
  if (dashboardProgressResetTimer) {
    clearTimeout(dashboardProgressResetTimer)
    dashboardProgressResetTimer = null
  }

  if (dashboardNavProgress.value <= 0 || dashboardNavProgress.value >= 100) {
    dashboardNavProgress.value = 8
  }

  if (dashboardProgressTimer) return

  dashboardProgressTimer = setInterval(() => {
    if (dashboardNavProgress.value >= 92) return

    if (dashboardNavProgress.value < 75) {
      dashboardNavProgress.value = Math.min(75, dashboardNavProgress.value + 9)
      return
    }

    dashboardNavProgress.value = Math.min(92, dashboardNavProgress.value + 2)
  }, 140)
}

function finishDashboardProgress() {
  clearDashboardProgressTimers()
  if (dashboardNavProgress.value <= 0) return

  dashboardNavProgress.value = 100
  dashboardProgressResetTimer = setTimeout(() => {
    dashboardNavProgress.value = 0
    dashboardProgressResetTimer = null
  }, 220)
}

async function recoverPendingTopups() {
  if (import.meta.server || topupRecoveryRunning.value) return
  if (!route.path.startsWith('/dashboard')) return
  if (route.path.startsWith('/dashboard/membership')) return

  const topupToken = readQueryString(route.query.topup)
  const orderId = readQueryString(route.query.orderId) ?? readQueryString(route.query.order_id)

  if (!topupToken && Date.now() - lastTopupRecoveryAt.value < 20_000) return

  topupRecoveryRunning.value = true
  lastTopupRecoveryAt.value = Date.now()

  let shouldClearTopupQuery = false
  try {
    const res = await $fetch<{ status?: string }>('/api/credits/topup/claim', {
      method: 'POST',
      body: topupToken
        ? { token: topupToken, orderId: orderId ?? undefined }
        : {}
    })

    const status = (res?.status ?? '').toLowerCase()
    if (topupToken && (status === 'processed' || status === 'failed')) {
      shouldClearTopupQuery = true
    }
  } catch {
    // Silent by design for global background recovery checks.
  } finally {
    topupRecoveryRunning.value = false
    if (shouldClearTopupQuery && route.query.topup) {
      const nextQuery = { ...route.query }
      delete nextQuery.topup
      delete nextQuery.orderId
      delete nextQuery.order_id
      await router.replace({ query: nextQuery })
    }
  }
}

onMounted(() => {
  if (!removeDashboardBeforeGuard) {
    removeDashboardBeforeGuard = router.beforeEach((to, from) => {
      if (to.fullPath === from.fullPath) return
      if (!(to.path.startsWith('/dashboard') && from.path.startsWith('/dashboard'))) return
      startDashboardProgress()
    })
  }

  if (!removeDashboardAfterGuard) {
    removeDashboardAfterGuard = router.afterEach((to, from) => {
      if (to.fullPath === from.fullPath) return
      if (!(to.path.startsWith('/dashboard') && from.path.startsWith('/dashboard'))) return
      finishDashboardProgress()
    })
  }

  if (!removeDashboardErrorGuard) {
    removeDashboardErrorGuard = router.onError(() => {
      finishDashboardProgress()
    })
  }

  void recoverPendingTopups()
})

watch(
  () => route.fullPath,
  () => {
    if (import.meta.client) void recoverPendingTopups()
  }
)

onBeforeUnmount(() => {
  clearDashboardProgressTimers()

  if (removeDashboardBeforeGuard) {
    removeDashboardBeforeGuard()
    removeDashboardBeforeGuard = null
  }

  if (removeDashboardAfterGuard) {
    removeDashboardAfterGuard()
    removeDashboardAfterGuard = null
  }

  if (removeDashboardErrorGuard) {
    removeDashboardErrorGuard()
    removeDashboardErrorGuard = null
  }
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <div class="pointer-events-none fixed inset-x-0 top-0 z-[80] h-1">
      <div
        class="h-full bg-primary transition-[width,opacity] duration-200 ease-out"
        :class="dashboardNavProgress > 0 ? 'opacity-100' : 'opacity-0'"
        :style="{ width: `${dashboardNavProgress}%` }"
      />
    </div>

    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="px-2 py-2">
          <NuxtLink
            to="/"
            class="flex items-center gap-2"
          >
            <img
              src="/images/logo.png"
              alt="FO Studio logo"
              class="h-7 w-7 shrink-0 object-contain dark:hidden"
            >
            <img
              src="/images/logo-white.png"
              alt="FO Studio logo"
              class="hidden h-7 w-7 shrink-0 object-contain dark:block"
            >
            <span
              v-if="!collapsed"
              class="font-semibold tracking-tight"
            >FO Studio</span>
          </NuxtLink>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          :collapsed="collapsed"
          class="bg-transparent ring-default"
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="sidebarLinks"
          orientation="vertical"
          tooltip
          popover
        />

        <UCard
          v-if="!collapsed"
          class="mt-4 border-default/70 bg-elevated/60"
        >
          <div class="space-y-2">
            <div class="text-[11px] uppercase tracking-wide text-dimmed">
              Membership
            </div>
            <div class="text-sm font-medium">
              {{ sidebarTierLabel ?? 'No active membership' }}
            </div>
            <div>
              <UBadge
                size="xs"
                variant="soft"
                :color="sidebarStatusColor"
              >
                {{ sidebarStatusLabel }}
              </UBadge>
            </div>
            <div class="space-y-1.5 text-xs">
              <div class="flex items-center justify-between text-dimmed">
                <span>Credits</span>
                <span>
                  {{ formatSidebarCreditValue(sidebarCreditsValue) }}
                  <template v-if="sidebarMaxBank > 0">
                    / {{ formatSidebarCreditValue(sidebarMaxBank) }}
                  </template>
                </span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :class="sidebarCreditsOverCap ? 'bg-red-500' : 'bg-primary'"
                  :style="{ width: `${sidebarCreditsProgress}%` }"
                />
              </div>
              <div
                v-if="sidebarCreditsOverCap"
                class="text-[11px] font-medium text-error"
              >
                Over cap
              </div>
            </div>
            <div
              v-if="showSidebarBalanceCta"
              class="pt-1"
            >
              <UButton
                size="xs"
                block
                color="primary"
                :to="sidebarMembershipState === 'active' ? '/dashboard/credits' : sidebarMembershipCta.to"
              >
                {{ sidebarMembershipState === 'active' ? 'Buy credits' : sidebarMembershipCta.label }}
              </UButton>
            </div>
          </div>
        </UCard>

        <UNavigationMenu
          :collapsed="collapsed"
          :items="supportLinks"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />

    <NotificationsSlideover />
  </UDashboardGroup>
</template>
