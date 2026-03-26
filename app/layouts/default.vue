<script setup lang="ts">
const toast = useToast()
const parallaxY = ref(0)

const shellStyle = computed(() => ({
  '--site-scroll-y': `${Math.round(parallaxY.value)}px`
}))

function syncParallaxOffset() {
  parallaxY.value = window.scrollY || 0
}

onMounted(async () => {
  syncParallaxOffset()
  window.addEventListener('scroll', syncParallaxOffset, { passive: true })

  const cookie = useCookie('cookie-consent')
  if (cookie.value === 'accepted') {
    return
  }

  toast.add({
    title: 'We use first-party cookies to enhance your experience on our website.',
    duration: 0,
    close: false,
    actions: [{
      label: 'Accept',
      color: 'neutral',
      variant: 'outline',
      onClick: () => {
        cookie.value = 'accepted'
      }
    }, {
      label: 'Opt out',
      color: 'neutral',
      variant: 'ghost'
    }]
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', syncParallaxOffset)
})
</script>

<template>
  <div
    class="site-shell"
    :style="shellStyle"
  >
    <AppHeader />

    <UMain class="relative">
      <slot />
    </UMain>

    <AppFooter />
  </div>
</template>
