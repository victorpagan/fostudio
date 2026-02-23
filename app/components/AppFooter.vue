<script setup lang="ts">
const year = new Date().getFullYear()

const footerLinks = [
  { label: 'Policies', to: '/policies' },
  { label: 'Contact', to: '/contact' },
  { label: 'Member login', to: '/login' }
]
</script>

<template>
  <UFooter class="border-t border-gray-200/60 py-10 dark:border-gray-800/60">
    <UContainer class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div class="text-sm text-gray-600 dark:text-gray-300">
        © {{ year }} FO Studio Rentals
      </div>

      <div class="flex flex-wrap gap-4 text-sm">
        <NuxtLink
          v-for="l in footerLinks"
          :key="l.to"
          :to="l.to"
          class="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          {{ l.label }}
        </NuxtLink>
      </div>
    </UContainer>
  </UFooter>
</template>
