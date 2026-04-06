<script setup lang="ts">
const route = useRoute()

const links = [
  { label: 'Overview', to: '/dashboard/admin/analytics' },
  { label: 'Metrics', to: '/dashboard/admin/analytics/metrics' },
  { label: 'Trends', to: '/dashboard/admin/analytics/trends' },
  { label: 'Alerts', to: '/dashboard/admin/analytics/alerts' },
  { label: 'Weekly report', to: '/dashboard/admin/analytics/report' }
]

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <UCard class="admin-panel-card border-0">
    <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
      Analytics sections
    </div>
    <div class="mt-2 flex flex-wrap gap-2">
      <UButton
        v-for="link in links"
        :key="link.to"
        size="xs"
        :color="isActive(link.to) ? 'primary' : 'neutral'"
        :variant="isActive(link.to) ? 'solid' : 'soft'"
        :to="link.to"
      >
        {{ link.label }}
      </UButton>
    </div>
  </UCard>
</template>
