<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

await navigateTo('/dashboard/admin', { replace: true })
</script>

<template>
  <div class="p-6 text-sm text-dimmed">
    Redirecting to Ops Overview…
  </div>
</template>
