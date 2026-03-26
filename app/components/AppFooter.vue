<script setup lang="ts">
const year = new Date().getFullYear()
const colorMode = useColorMode()
const isDarkMode = computed(() => colorMode.value === 'dark')

const footerLinks = [
  { label: 'Policies', to: '/policies' },
  { label: 'Contact', to: '/contact' },
  { label: 'Member login', to: '/login' }
]

function toggleColorMode() {
  colorMode.value = isDarkMode.value ? 'light' : 'dark'
}
</script>

<template>
  <UFooter class="border-t border-[color:var(--gruv-line)] py-10">
    <UContainer class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div class="space-y-1">
        <div class="text-sm text-[color:var(--gruv-ink-2)]">
          © {{ year }} FO Studio
        </div>
        <div class="text-xs uppercase tracking-[0.18em] text-[color:var(--gruv-ink-2)]">
          Studio access shaped around production rhythm
        </div>
      </div>

      <div class="flex flex-wrap gap-4 text-sm">
        <NuxtLink
          v-for="l in footerLinks"
          :key="l.to"
          :to="l.to"
          class="text-[color:var(--gruv-ink-2)] transition-colors hover:text-[color:var(--gruv-accent)]"
        >
          {{ l.label }}
        </NuxtLink>

        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :icon="isDarkMode ? 'i-lucide-moon' : 'i-lucide-sun'"
          class="h-7 rounded-full px-2 text-[color:var(--gruv-ink-2)]"
          :aria-label="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleColorMode"
        >
          {{ isDarkMode ? 'Dark' : 'Light' }}
        </UButton>
      </div>
    </UContainer>
  </UFooter>
</template>
