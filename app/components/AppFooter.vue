<script setup lang="ts">
const year = new Date().getFullYear()

const footerLinks = [
  { label: 'Policies', to: '/policies' },
  { label: 'Contact', to: '/contact' },
  { label: 'Member login', to: '/login' }
]
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
      </div>
    </UContainer>
  </UFooter>
</template>
