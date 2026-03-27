<script setup lang="ts">
const year = new Date().getFullYear()
const colorMode = useColorMode()
const isDarkMode = computed(() => colorMode.value === 'dark')
const config = useRuntimeConfig()

const footerPhone = computed(() => config.public.contactPhone?.trim() || '')
const footerAddress = computed(() => config.public.contactLocation?.trim() || '')
const footerAddressLines = computed(() => {
  if (!footerAddress.value) return []
  return footerAddress.value
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
})
const footerPhoneHref = computed(() => {
  if (!footerPhone.value) return ''
  const normalized = footerPhone.value.replace(/[^\d+]/g, '')
  return normalized ? `tel:${normalized}` : ''
})

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
  <UFooter class="site-footer">
    <UContainer class="site-footer-row">
      <div class="site-footer-brand">
        <div class="site-footer-copyright">
          © {{ year }} FO Studio
        </div>
        <div
          v-if="footerAddress || footerPhone"
          class="site-footer-contact"
        >
          <span
            v-for="line in footerAddressLines"
            :key="line"
            class="site-footer-contact-item"
          >
            {{ line }}
          </span>
          <a
            v-if="footerPhone"
            :href="footerPhoneHref || undefined"
            class="site-footer-contact-item site-footer-contact-phone"
          >
            {{ footerPhone }}
          </a>
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
    </UContainer>
  </UFooter>
</template>
