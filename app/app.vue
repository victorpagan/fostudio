<script setup lang="ts">
const colorMode = useColorMode()
const route = useRoute()
const router = useRouter()
const nuxtApp = useNuxtApp()
const cookieConsent = useCookieConsent()

const color = computed(() => colorMode.value === 'dark' ? '#131413' : '#FCFAED')
const sitePageTransition = { name: 'site-page', mode: 'out-in' as const }
const globalDashboardNavProgress = useState<number>('global-dashboard-nav-progress', () => 0)
const globalDashboardHooksBound = useState<boolean>('global-dashboard-nav-hooks-bound', () => false)
const globalDashboardAnnouncement = ref('')
const pageContentRef = ref<HTMLElement | null>(null)
const GLOBAL_DASHBOARD_PROGRESS_MIN_VISIBLE_MS = 380
const GLOBAL_DASHBOARD_PROGRESS_RESET_MS = 220
const GOOGLE_ADS_TAG_ID = 'AW-18068877892'

let globalDashboardProgressTimer: ReturnType<typeof setInterval> | null = null
let globalDashboardProgressDelayTimer: ReturnType<typeof setTimeout> | null = null
let globalDashboardProgressResetTimer: ReturnType<typeof setTimeout> | null = null
let removeGlobalDashboardBeforeGuard: (() => void) | null = null
let removeGlobalDashboardErrorGuard: (() => void) | null = null
let globalDashboardProgressStartedAt = 0

const pageTransition = computed(() => {
  if (route.path.startsWith('/dashboard')) {
    return false
  }

  return sitePageTransition
})

const pageContentRole = computed(() => {
  if (route.path.startsWith('/dashboard') || route.meta.layout === 'auth' || route.meta.layout === false) {
    return 'main'
  }

  // The default layout already renders UMain, so adding another landmark would
  // create an invalid nested main region.
  return undefined
})

const pageContentClass = computed(() => ({
  'app-page-content--dashboard': route.path.startsWith('/dashboard')
}))

function clearGlobalDashboardProgressTimers() {
  if (globalDashboardProgressTimer) {
    clearInterval(globalDashboardProgressTimer)
    globalDashboardProgressTimer = null
  }
  if (globalDashboardProgressDelayTimer) {
    clearTimeout(globalDashboardProgressDelayTimer)
    globalDashboardProgressDelayTimer = null
  }
  if (globalDashboardProgressResetTimer) {
    clearTimeout(globalDashboardProgressResetTimer)
    globalDashboardProgressResetTimer = null
  }
}

function startGlobalDashboardProgress() {
  if (globalDashboardProgressDelayTimer) {
    clearTimeout(globalDashboardProgressDelayTimer)
    globalDashboardProgressDelayTimer = null
  }

  if (globalDashboardProgressResetTimer) {
    clearTimeout(globalDashboardProgressResetTimer)
    globalDashboardProgressResetTimer = null
  }

  if (globalDashboardNavProgress.value <= 0 || globalDashboardNavProgress.value >= 100) {
    globalDashboardNavProgress.value = 8
    globalDashboardProgressStartedAt = Date.now()
    globalDashboardAnnouncement.value = 'Loading dashboard'
  } else if (!globalDashboardProgressStartedAt) {
    globalDashboardProgressStartedAt = Date.now()
  }

  if (globalDashboardProgressTimer) return

  globalDashboardProgressTimer = setInterval(() => {
    if (globalDashboardNavProgress.value >= 90) return

    if (globalDashboardNavProgress.value < 70) {
      globalDashboardNavProgress.value = Math.min(70, globalDashboardNavProgress.value + 10)
      return
    }

    globalDashboardNavProgress.value = Math.min(90, globalDashboardNavProgress.value + 2)
  }, 120)
}

function finishGlobalDashboardProgress() {
  const completeProgress = () => {
    if (globalDashboardProgressTimer) {
      clearInterval(globalDashboardProgressTimer)
      globalDashboardProgressTimer = null
    }

    globalDashboardNavProgress.value = 100
    globalDashboardProgressStartedAt = 0
    globalDashboardAnnouncement.value = 'Dashboard loaded'

    if (globalDashboardProgressResetTimer) {
      clearTimeout(globalDashboardProgressResetTimer)
    }
    globalDashboardProgressResetTimer = setTimeout(() => {
      globalDashboardNavProgress.value = 0
      globalDashboardProgressResetTimer = null
    }, GLOBAL_DASHBOARD_PROGRESS_RESET_MS)
  }

  if (globalDashboardNavProgress.value <= 0) return

  const elapsed = globalDashboardProgressStartedAt > 0
    ? (Date.now() - globalDashboardProgressStartedAt)
    : GLOBAL_DASHBOARD_PROGRESS_MIN_VISIBLE_MS
  const remainingVisibleMs = Math.max(0, GLOBAL_DASHBOARD_PROGRESS_MIN_VISIBLE_MS - elapsed)
  if (remainingVisibleMs > 0) {
    if (globalDashboardProgressDelayTimer) {
      clearTimeout(globalDashboardProgressDelayTimer)
    }
    globalDashboardProgressDelayTimer = setTimeout(() => {
      globalDashboardProgressDelayTimer = null
      completeProgress()
    }, remainingVisibleMs)
    return
  }

  completeProgress()
}

function focusMainContent() {
  requestAnimationFrame(() => {
    pageContentRef.value?.focus({ preventScroll: true })
  })
}

onMounted(() => {
  if (!removeGlobalDashboardBeforeGuard) {
    removeGlobalDashboardBeforeGuard = router.beforeEach((to, from) => {
      if (to.fullPath === from.fullPath) return
      if (to.path.startsWith('/dashboard') && !from.path.startsWith('/dashboard')) {
        startGlobalDashboardProgress()
      }
    })
  }

  if (!globalDashboardHooksBound.value) {
    globalDashboardHooksBound.value = true

    nuxtApp.hook('page:finish', () => {
      if (globalDashboardNavProgress.value > 0) finishGlobalDashboardProgress()
    })

    nuxtApp.hook('app:error', () => {
      if (globalDashboardNavProgress.value > 0) finishGlobalDashboardProgress()
    })
  }

  if (!removeGlobalDashboardErrorGuard) {
    removeGlobalDashboardErrorGuard = router.onError(() => {
      finishGlobalDashboardProgress()
    })
  }
})

onBeforeUnmount(() => {
  clearGlobalDashboardProgressTimers()

  if (removeGlobalDashboardBeforeGuard) {
    removeGlobalDashboardBeforeGuard()
    removeGlobalDashboardBeforeGuard = null
  }

  if (removeGlobalDashboardErrorGuard) {
    removeGlobalDashboardErrorGuard()
    removeGlobalDashboardErrorGuard = null
  }
})

useHead({
  titleTemplate: title => title ? `${title} | FO Studio` : 'FO Studio',
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useHead(() => !import.meta.dev && cookieConsent.value === 'accepted'
  ? {
      script: [
        {
          key: 'google-ads-gtag-src',
          async: true,
          src: `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_TAG_ID}`
        },
        {
          key: 'google-ads-gtag-init',
          innerHTML: [
            'window.dataLayer = window.dataLayer || [];',
            'function gtag(){dataLayer.push(arguments);}',
            'gtag(\'js\', new Date());',
            `gtag('config', '${GOOGLE_ADS_TAG_ID}');`
          ].join('\n')
        }
      ]
    }
  : {})

useSeoMeta({
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <a
      class="app-skip-link"
      href="#main-content"
      @click="focusMainContent"
    >
      Skip to main content
    </a>

    <div
      class="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1"
      aria-hidden="true"
    >
      <div
        class="app-navigation-progress h-full bg-primary transition-[width,opacity] duration-200 ease-out"
        :class="globalDashboardNavProgress > 0 ? 'opacity-100' : 'opacity-0'"
        :style="{ width: `${globalDashboardNavProgress}%` }"
      />
    </div>

    <p
      class="visually-hidden"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ globalDashboardAnnouncement }}
    </p>

    <NuxtLayout>
      <div
        id="main-content"
        ref="pageContentRef"
        class="app-page-content"
        :class="pageContentClass"
        :role="pageContentRole"
        tabindex="-1"
      >
        <NuxtPage
          :transition="pageTransition"
          :page-key="to => to.path"
        />
      </div>
    </NuxtLayout>
  </UApp>
</template>
