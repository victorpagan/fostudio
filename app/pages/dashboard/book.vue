<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'membership-required']
})
</script>

<template>
  <UContainer class="py-10">
    <UCard>
      <div class="text-lg font-semibold">Book Studio</div>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Booking UI coming next.
      </p>
    </UCard>
  </UContainer>
</template>
