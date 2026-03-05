<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const route = useRoute()
const { isAdmin } = useCurrentUser()

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
