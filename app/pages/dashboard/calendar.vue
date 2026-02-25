<script setup lang="ts">
/**
 * /dashboard/calendar — Calendar view for logged-in users.
 *
 * Uses the member calendar endpoint so confirmed/requested bookings
 * show with richer detail (compared to the public /api/calendar/public).
 * Members without an active membership see the public feed — they can
 * still view availability, they just can't book via credit.
 */
definePageMeta({ middleware: ['auth'] })

const { isMember, isAdmin } = useCurrentUser()

// Active members & admins see the member feed (includes their own bookings
// highlighted). Everyone else sees the public availability feed.
const endpoint = computed(() =>
  isMember.value || isAdmin.value ? '/api/calendar/member' : '/api/calendar/public'
)
</script>

<template>
  <UDashboardPanel id="calendar">
    <template #header>
      <UDashboardNavbar title="Calendar" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            size="sm"
            icon="i-lucide-calendar-plus"
            to="/dashboard/book"
          >
            Book studio
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4">
        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <AvailabilityCalendar :endpoint="endpoint" />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
