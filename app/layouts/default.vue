<script setup lang="ts">
const toast = useToast()
const route = useRoute()
const parallaxY = ref(0)
let rafId: number | null = null

const shellStyle = computed(() => ({
  '--site-scroll-y': `${Math.round(parallaxY.value)}px`
}))

const mainClass = computed(() => {
  if (route.path === '/') {
    return 'relative'
  }
  return 'relative pt-20 sm:pt-24'
})

function readScrollY() {
  return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
}

function syncParallaxOffset() {
  parallaxY.value = Math.max(0, readScrollY())
}

function onWindowScroll() {
  if (rafId !== null) return
  rafId = window.requestAnimationFrame(() => {
    rafId = null
    syncParallaxOffset()
  })
}

onMounted(async () => {
  syncParallaxOffset()
  window.addEventListener('scroll', onWindowScroll, { passive: true })

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
  window.removeEventListener('scroll', onWindowScroll)
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }
})
</script>

<template>
  <div
    class="site-shell"
    :style="shellStyle"
  >
    <AppHeader />

    <UMain :class="mainClass">
      <slot />
    </UMain>

    <AppFooter />
  </div>
</template>
