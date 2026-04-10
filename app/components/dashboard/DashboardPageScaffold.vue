<script setup lang="ts">
withDefaults(defineProps<{
  panelId: string
  title: string
  panelClass?: string
  navbarClass?: string
  useOpsShell?: boolean
}>(), {
  panelClass: 'min-h-0 flex-1 admin-ops-panel',
  navbarClass: 'admin-ops-navbar',
  useOpsShell: true
})
</script>

<template>
  <UDashboardPanel
    :id="panelId"
    :class="panelClass"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        :title="title"
        :class="navbarClass"
        :ui="{ root: 'border-b-0', right: 'gap-2' }"
      >
        <template #leading>
          <slot name="leading">
            <UDashboardSidebarCollapse />
          </slot>
        </template>

        <template #right>
          <slot name="right" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AdminOpsShell v-if="useOpsShell">
        <slot />
      </AdminOpsShell>
      <slot v-else />
    </template>
  </UDashboardPanel>
</template>
