<script setup lang="ts">
definePageMeta({
  middleware: ['auth']
})
</script>

<template>
  <UDashboardPanel id="membership">
    <template #header>
      <UDashboardNavbar title="Membership">
        <template #leading><UDashboardSidebarCollapse /></template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4">
        <UCard>
          <div class="text-sm text-muted">Membership</div>
          <div class="mt-2 text-sm text-dimmed">
            Manage plan / finish checkout UI coming next.
          </div>

          <div class="mt-4 flex gap-2">
            <UButton to="/memberships">View plans</UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
