<script setup lang="ts">
const route = useRoute()
const isOpen = ref(false)

const links = [
  { label: 'Calendar', to: '/calendar' },
  { label: 'Memberships', to: '/memberships' },
  { label: 'Equipment', to: '/equipment' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Contact', to: '/contact' }
]

// Later you can wire real auth state (Supabase, etc.)
const isAuthed = false
const rightLinks = computed(() => {
  if (isAuthed) return [{ label: 'Dashboard', to: '/dashboard' }]
  return [{ label: 'Login', to: '/login' }]
})
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-gray-200/60 bg-white/75 backdrop-blur dark:border-gray-800/60 dark:bg-gray-950/75">
    <UContainer class="flex h-16 items-center justify-between">
      <NuxtLink to="/" class="flex items-center gap-2">
        <div class="h-9 w-9 rounded-xl bg-gray-900 dark:bg-gray-100" />
        <span class="font-semibold tracking-tight">FO Studio</span>
      </NuxtLink>

      <!-- Desktop nav -->
      <nav class="hidden items-center gap-6 md:flex">
        <NuxtLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="text-sm transition-colors"
          :class="route.path === l.to
            ? 'text-gray-900 dark:text-white'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'"
        >
          {{ l.label }}
        </NuxtLink>
      </nav>

      <div class="flex items-center gap-2">
        <UButton color="neutral" variant="soft" to="/calendar" class="hidden sm:inline-flex">
          View Availability
        </UButton>
        <UButton to="/memberships">
          Join
        </UButton>

        <NuxtLink
          v-for="l in rightLinks"
          :key="l.to"
          :to="l.to"
          class="ml-2 hidden text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white md:inline"
        >
          {{ l.label }}
        </NuxtLink>

        <!-- Mobile menu button -->
        <UButton
          icon="i-heroicons-bars-3"
          color="neutral"
          variant="ghost"
          aria-label="Menu"
          class="md:hidden"
          @click="isOpen = !isOpen"
        />
      </div>
    </UContainer>

    <!-- Mobile menu -->
    <div v-if="isOpen" class="border-t border-gray-200/60 bg-white/75 backdrop-blur dark:border-gray-800/60 dark:bg-gray-950/75 md:hidden">
      <UContainer class="space-y-2 py-4">
        <NuxtLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="block rounded px-3 py-2 text-sm transition-colors"
          :class="route.path === l.to
            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
            : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900'"
          @click="isOpen = false"
        >
          {{ l.label }}
        </NuxtLink>
        <NuxtLink
          v-for="l in rightLinks"
          :key="l.to"
          :to="l.to"
          class="block rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
          @click="isOpen = false"
        >
          {{ l.label }}
        </NuxtLink>
      </UContainer>
    </div>
  </header>
</template>
