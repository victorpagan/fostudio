<script setup lang="ts">
const year = new Date().getFullYear()
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

          <a
            href="https://instagram.com/fostudio.la"
            target="_blank"
            rel="noopener noreferrer"
            class="site-footer-link site-footer-social-link"
            aria-label="FO Studio on Instagram"
          >
            <UIcon
              name="i-simple-icons-instagram"
              class="site-footer-social-icon"
            />
            <span>@fostudio.la</span>
          </a>

          <UColorModeButton
            color="neutral"
            variant="ghost"
            size="sm"
            class="site-footer-theme-toggle"
          />
        </div>
      </div>
    </div>
  </footer>
</template>
