<script setup lang="ts">
const year = new Date().getFullYear()
const colorMode = useColorMode()
const isDarkMode = computed(() => colorMode.value === 'dark')
const footerAddressLines = [
  'FO Studio',
  '3131 N. San Fernando Rd.',
  'Los Angeles, CA 90065'
]

const footerLinks = [
  { label: 'Policies', to: '/policies' },
  { label: 'Contact', to: '/contact' },
  { label: 'Member login', to: '/login' }
]

function toggleColorMode() {
  colorMode.preference = isDarkMode.value ? 'light' : 'dark'
}
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer-frame">
      <div class="site-footer-row">
        <div class="site-footer-brand">
          <div class="site-footer-contact">
            <span
              v-for="line in footerAddressLines"
              :key="line"
              class="site-footer-contact-item"
            >
              {{ line }}
            </span>
          </div>
          <div class="site-footer-copyright">
            © {{ year }}
          </div>
        </div>

        <div class="site-footer-links-wrap">
          <NuxtLink
            v-for="l in footerLinks"
            :key="l.to"
            :to="l.to"
            class="site-footer-link"
          >
            {{ l.label }}
          </NuxtLink>

          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :icon="isDarkMode ? 'i-lucide-moon' : 'i-lucide-sun'"
            class="site-footer-theme-toggle"
            :aria-label="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleColorMode"
          />
        </div>
      </div>
    </div>
  </footer>
</template>
