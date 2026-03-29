<script setup lang="ts">
const toast = useToast()
const route = useRoute()
const parallaxY = ref(0)
const homeIntroReady = ref(false)
let rafId: number | null = null
let revealObserver: IntersectionObserver | null = null

const shellStyle = computed(() => ({
  '--site-scroll-y': `${Math.round(parallaxY.value)}px`
}))

const isHomeRoute = computed(() => route.path === '/')

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

function triggerHomeIntro() {
  homeIntroReady.value = false
  if (!isHomeRoute.value) return

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      homeIntroReady.value = true
    })
  })
}

function setupSectionReveal() {
  revealObserver?.disconnect()
  revealObserver = null

  const nodes = [...document.querySelectorAll<HTMLElement>('[data-reveal]')]
  if (!nodes.length) return

  nodes.forEach((node, index) => {
    node.classList.add('site-reveal')
    node.classList.remove('is-visible')

    if (node.dataset.revealDelay) {
      node.style.setProperty('--reveal-delay', node.dataset.revealDelay)
    } else {
      node.style.setProperty('--reveal-delay', `${Math.min(index * 55, 360)}ms`)
    }
  })

  revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const target = entry.target as HTMLElement
      if (entry.isIntersecting) {
        target.classList.add('is-visible')
        if (target.dataset.revealOnce !== 'false') {
          revealObserver?.unobserve(target)
        }
      } else if (target.dataset.revealOnce === 'false') {
        target.classList.remove('is-visible')
      }
    }
  }, {
    threshold: 0.16,
    rootMargin: '0px 0px -8% 0px'
  })

  nodes.forEach(node => revealObserver?.observe(node))
}

onMounted(async () => {
  syncParallaxOffset()
  window.addEventListener('scroll', onWindowScroll, { passive: true })
  triggerHomeIntro()
  await nextTick()
  setupSectionReveal()

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

watch(() => route.fullPath, async () => {
  await nextTick()
  triggerHomeIntro()
  window.requestAnimationFrame(() => {
    setupSectionReveal()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onWindowScroll)
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }
  revealObserver?.disconnect()
  revealObserver = null
})
</script>

<template>
  <div
    class="site-shell"
    :class="{
      'site-shell--home': isHomeRoute,
      'site-shell--home-ready': isHomeRoute && homeIntroReady
    }"
    :style="shellStyle"
  >
    <AppHeader />

    <UMain :class="mainClass">
      <Transition
        name="site-page"
        mode="out-in"
        appear
      >
        <div
          :key="route.fullPath"
          class="site-page-frame"
        >
          <slot />
        </div>
      </Transition>
    </UMain>

    <AppFooter />
  </div>
</template>
