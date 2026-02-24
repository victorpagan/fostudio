<script setup lang="ts">
definePageMeta({
  layout: 'default'
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
    <UContainer class="py-20">
      <div class="text-center">
        <h1 class="text-4xl font-bold tracking-tight">Studio Equipment</h1>
        <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Explore our professional-grade photography and video equipment
        </p>
      </div>

      <div class="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <!-- Placeholder cards -->
        <div v-for="i in 6" :key="i" class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div class="h-40 rounded bg-gray-200 dark:bg-gray-800" />
          <h3 class="mt-4 font-semibold">Equipment Item {{ i }}</h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Details and specifications coming soon
          </p>
        </div>
      </div>
    </UContainer>
  </div>
</template>
