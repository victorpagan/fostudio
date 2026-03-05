<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

const sections = [
  {
    title: 'Ops tools',
    description: 'Grant processing, backfill controls, and guest booking monitoring.',
    icon: 'i-lucide-wrench',
    to: '/dashboard/admin/tools'
  },
  {
    title: 'Subscriptions',
    description: 'Create or edit tiers and plan variations, then sync subscription prices to Square.',
    icon: 'i-lucide-badge-check',
    to: '/dashboard/admin/subscriptions'
  },
  {
    title: 'Credits',
    description: 'Manage single-credit and bundle pricing, sale windows, and Square item linkage.',
    icon: 'i-lucide-wallet-cards',
    to: '/dashboard/admin/credits'
  },
  {
    title: 'Promo codes',
    description: 'Manage promo code inventory, validity windows, and redemption limits.',
    icon: 'i-lucide-ticket-percent',
    to: '/dashboard/admin/promos'
  },
  {
    title: 'Members',
    description: 'Review member accounts, adjust statuses, and apply manual credit corrections.',
    icon: 'i-lucide-users',
    to: '/dashboard/admin/members'
  },
  {
    title: 'Bookings & calendar',
    description: 'Review all bookings and run admin-level cancellation/refund actions.',
    icon: 'i-lucide-calendar-range',
    to: '/dashboard/admin/bookings'
  }
]

const { data, pending, refresh } = await useAsyncData('admin:overview:ops', async () => {
  return await $fetch('/api/admin/ops')
})
</script>

<template>
  <UDashboardPanel id="admin-overview">
    <template #header>
      <UDashboardNavbar title="Admin Overview" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-shield-check"
          title="Admin-only area"
          description="Use these sections to manage subscriptions, credits, promotions, members, and booking operations."
        />

        <div class="grid gap-4 md:grid-cols-5">
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Due grants
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ data?.summary?.dueGrantCount ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Scheduled grants
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ data?.summary?.scheduledGrantCount ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Needs attention
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ data?.summary?.membershipsNeedingAttention ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Guest bookings
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ data?.summary?.guestBookings ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Missing schedules
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ data?.summary?.membershipsMissingFutureSchedule ?? 0 }}
            </div>
          </UCard>
        </div>

        <div class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <UCard
            v-for="section in sections"
            :key="section.to"
            class="h-full"
          >
            <div class="flex h-full flex-col">
              <div class="flex items-center gap-2">
                <UIcon :name="section.icon" class="size-5 text-primary" />
                <div class="font-medium">
                  {{ section.title }}
                </div>
              </div>
              <p class="mt-2 text-sm text-dimmed flex-1">
                {{ section.description }}
              </p>
              <UButton class="mt-4" :to="section.to" size="sm">
                Open
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
