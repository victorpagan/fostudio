<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const route = useRoute()
const router = useRouter()
const { isAdmin } = useCurrentUser()
const topupRecoveryRunning = useState<boolean>('topup-recovery-running', () => false)
const lastTopupRecoveryAt = useState<number>('topup-recovery-last-at', () => 0)

const adminLinks = computed<NavigationMenuItem[]>(() => (isAdmin.value
  ? [
      {
        label: 'Overview',
        icon: 'i-lucide-layout-dashboard',
        to: '/dashboard/admin',
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
        label: 'Bookings & Calendar',
        icon: 'i-lucide-calendar-range',
        to: '/dashboard/admin/bookings',
        onSelect: () => { open.value = false }
      }
    ]
  : []))

const primaryLinks = computed<NavigationMenuItem[]>(() => [
  {
    label: 'Dashboard',
    icon: 'i-lucide-house',
    to: '/dashboard',
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
    label: 'Membership & Credits',
    icon: 'i-lucide-badge-check',
    to: '/dashboard/membership',
    onSelect: () => { open.value = false }
  },
  {
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/dashboard/profile',
    onSelect: () => { open.value = false }
  },
  ...(adminLinks.value.length
    ? [{
        label: 'Admin',
        icon: 'i-lucide-shield',
        children: adminLinks.value,
        defaultOpen: route.path.startsWith('/dashboard/admin'),
        onSelect: () => { open.value = false }
      }]
    : [])
])

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

function readQueryString(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.trim())
    if (typeof first === 'string' && first.trim()) return first.trim()
  }
  return null
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
  void recoverPendingTopups()
})

watch(
  () => route.fullPath,
  () => {
    if (import.meta.client) void recoverPendingTopups()
  },
  { immediate: true }
)
</script>

<template>
  <UDashboardGroup unit="rem">
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
            <div class="h-8 w-8 rounded-xl bg-gray-900 dark:bg-gray-100" />
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
          :items="primaryLinks"
          orientation="vertical"
          tooltip
          popover
        />

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
