<script setup lang="ts">
definePageMeta({ auth: false })

await navigateTo('/signup?returnTo=/dashboard/book', { redirectCode: 302 })
</script>

<template>
  <div />
</template>
