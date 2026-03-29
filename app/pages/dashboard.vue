<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'bootstrap-customer']
})
</script>

<template>
  <div class="dashboard-route-shell">
    <NuxtPage />
  </div>
</template>
