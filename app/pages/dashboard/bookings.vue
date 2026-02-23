<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'membership-required']
})
</script>

<template>
  <UDashboardPanel id="bookings">
    <template #header>
      <UDashboardNavbar title="Bookings">
        <template #leading><UDashboardSidebarCollapse /></template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4">
        <UCard>
          <div class="text-sm text-muted">Bookings</div>
          <div class="mt-2 text-sm text-dimmed">Booking history UI coming next.</div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
