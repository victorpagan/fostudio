<script setup lang="ts">
const route = useRoute()
const isOpen = ref(false)
const isScrolled = ref(false)
const supabase = useSupabaseClient()
const router = useRouter()
const { user, isAdmin } = useCurrentUser()
let scrollRaf: number | null = null

const isAuthed = computed(() => !!user.value)
const dashboardHref = computed(() => (isAuthed.value ? '/dashboard' : '/login'))

const links = [
  { label: 'Calendar', to: '/calendar' },
  { label: 'Memberships', to: '/memberships' },
  { label: 'Equipment', to: '/equipment' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Contact', to: '/contact' }
]

function isLinkActive(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`)
}

const displayName = computed(() => {
  if (!user.value) return null
  const meta = user.value.user_metadata as Record<string, string> | undefined
  if (meta?.first_name) return `${meta.first_name} ${meta.last_name ?? ''}`.trim()
  return user.value.email ?? null
})

const accountMenuItems = computed(() => [
  [{ label: displayName.value ?? 'Account', type: 'label' }],
  [
    { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/dashboard' },
    { label: 'My Bookings', icon: 'i-lucide-calendar', to: '/dashboard/bookings' },
    { label: 'Membership & Credits', icon: 'i-lucide-badge-check', to: '/dashboard/membership' },
    { label: 'Profile', icon: 'i-lucide-user', to: '/dashboard/profile' },
    ...(isAdmin.value
      ? [{ label: 'Admin', icon: 'i-lucide-shield', to: '/dashboard/admin' }]
      : [])
  ],
  [{ label: 'Log out', icon: 'i-lucide-log-out', onSelect: logout }]
])

watch(() => route.fullPath, () => {
  isOpen.value = false
})

function syncScrolledState() {
  isScrolled.value = (window.scrollY || window.pageYOffset || 0) > 8
}

function onWindowScroll() {
  if (scrollRaf !== null) return
  scrollRaf = window.requestAnimationFrame(() => {
    scrollRaf = null
    syncScrolledState()
  })
}

onMounted(() => {
  syncScrolledState()
  window.addEventListener('scroll', onWindowScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onWindowScroll)
  if (scrollRaf !== null) {
    window.cancelAnimationFrame(scrollRaf)
    scrollRaf = null
  }
})

async function logout() {
  await supabase.auth.signOut()
  isOpen.value = false
  await router.push('/')
}
</script>

<template>
  <header
    class="site-header"
    :class="{ 'site-header--scrolled': isScrolled }"
  >
    <div class="site-header-frame">
      <div class="site-header-row">
        <NuxtLink
          to="/"
          class="site-brand"
        >
          <div class="site-brand-mark">
            <span class="studio-display text-lg leading-none">FO</span>
          </div>
          <div class="leading-none">
            <div class="site-brand-title">FO Studio</div>
            <div class="site-brand-subtitle">24/7 production studio</div>
          </div>
        </NuxtLink>

        <div class="site-header-right">
          <nav
            class="site-nav hidden lg:flex"
            aria-label="Main navigation"
          >
            <NuxtLink
              v-for="l in links"
              :key="l.to"
              :to="l.to"
              class="site-nav-link"
              :class="{ 'is-active': isLinkActive(l.to) }"
            >
              {{ l.label }}
            </NuxtLink>
          </nav>

          <div class="site-header-actions">
            <template v-if="!isAuthed">
              <NuxtLink
                to="/login"
                class="site-auth-link hidden sm:inline-flex"
              >
                Login
              </NuxtLink>
              <NuxtLink
                :to="dashboardHref"
                class="site-auth-link sm:hidden"
              >
                Dashboard
              </NuxtLink>
              <UButton
                :to="dashboardHref"
                color="neutral"
                variant="soft"
                class="hidden sm:inline-flex"
              >
                Dashboard
              </UButton>
            </template>

            <template v-else>
              <UButton
                to="/dashboard"
                color="neutral"
                variant="soft"
                class="hidden sm:inline-flex"
              >
                Dashboard
              </UButton>
              <UDropdownMenu
                :items="accountMenuItems"
                :content="{ align: 'end' }"
              >
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-circle-user"
                  class="hidden sm:inline-flex"
                />
              </UDropdownMenu>
            </template>

            <UButton
              icon="i-heroicons-bars-3"
              color="neutral"
              variant="ghost"
              aria-label="Menu"
              class="lg:hidden"
              @click="isOpen = !isOpen"
            />
          </div>
        </div>
      </div>
    </div>

    <Transition name="fade-slide">
      <div
        v-if="isOpen"
        class="site-mobile-menu lg:hidden"
      >
        <div class="site-mobile-menu-inner space-y-2 py-4">
          <NuxtLink
            v-for="l in links"
            :key="l.to"
            :to="l.to"
            class="site-mobile-link"
            :class="{ 'is-active': isLinkActive(l.to) }"
            @click="isOpen = false"
          >
            {{ l.label }}
          </NuxtLink>

          <div class="my-2 h-px bg-[color:var(--gruv-accent-soft)]" />

          <template v-if="!isAuthed">
            <NuxtLink
              :to="dashboardHref"
              class="site-mobile-link"
              @click="isOpen = false"
            >
              Dashboard
            </NuxtLink>
            <NuxtLink
              to="/login"
              class="site-mobile-link"
              @click="isOpen = false"
            >
              Login
            </NuxtLink>
          </template>

          <template v-else>
            <p class="truncate px-3 py-1 text-xs font-medium text-[color:var(--gruv-ink-2)]">
              {{ displayName }}
            </p>
            <NuxtLink
              to="/dashboard"
              class="site-mobile-link"
              @click="isOpen = false"
            >
              Dashboard
            </NuxtLink>
            <NuxtLink
              to="/dashboard/bookings"
              class="site-mobile-link"
              @click="isOpen = false"
            >
              My Bookings
            </NuxtLink>
            <NuxtLink
              to="/dashboard/membership"
              class="site-mobile-link"
              @click="isOpen = false"
            >
              Membership &amp; Credits
            </NuxtLink>
            <NuxtLink
              to="/dashboard/profile"
              class="site-mobile-link"
              @click="isOpen = false"
            >
              Profile
            </NuxtLink>
            <NuxtLink
              v-if="isAdmin"
              to="/dashboard/admin"
              class="site-mobile-link"
              @click="isOpen = false"
            >
              Admin
            </NuxtLink>
            <button
              class="site-mobile-link site-mobile-link-danger w-full text-left"
              @click="logout"
            >
              Log out
            </button>
          </template>
        </div>
      </div>
    </Transition>
  </header>
</template>
