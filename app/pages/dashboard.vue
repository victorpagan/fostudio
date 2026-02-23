<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth', 'bootstrap-customer']
})
</script>

<template>
  <NuxtPage />
</template>
