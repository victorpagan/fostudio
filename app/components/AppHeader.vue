<script setup lang="ts">
const route = useRoute()
const isOpen = ref(false)
const supabase = useSupabaseClient()
const router = useRouter()
const { user, isAdmin } = useCurrentUser()

const isAuthed = computed(() => !!user.value)

const links = [
  { label: 'Calendar', to: '/calendar' },
  { label: 'Memberships', to: '/memberships' },
  { label: 'Equipment', to: '/equipment' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Contact', to: '/contact' }
]

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

async function logout() {
  await supabase.auth.signOut()
  isOpen.value = false
  await router.push('/')
}
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-[color:var(--gruv-line)] bg-[rgba(249,245,215,0.82)] backdrop-blur dark:bg-[rgba(29,32,33,0.86)]">
    <UContainer class="flex h-16 items-center justify-between">
      <NuxtLink
        to="/"
        class="flex items-center gap-3"
      >
        <div class="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--gruv-line)] bg-[rgba(181,118,20,0.12)] text-[color:var(--gruv-accent)]">
          <span class="studio-display text-lg leading-none">FO</span>
        </div>
        <div class="leading-none">
          <div class="studio-display text-xl text-[color:var(--gruv-ink-0)]">FO Studio</div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.24em] text-[color:var(--gruv-ink-2)]">
            Built for working image-makers
          </div>
        </div>
      </NuxtLink>

      <!-- Desktop nav -->
      <nav class="hidden items-center gap-6 md:flex">
        <NuxtLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="text-sm transition-colors"
          :class="route.path === l.to
            ? 'text-[color:var(--gruv-ink-0)]'
            : 'text-[color:var(--gruv-ink-2)] hover:text-[color:var(--gruv-accent)]'"
        >
          {{ l.label }}
        </NuxtLink>
      </nav>

      <div class="flex items-center gap-2">
        <!-- Logged OUT state -->
        <template v-if="!isAuthed">
          <UButton
            color="neutral"
            variant="soft"
            to="/calendar"
            class="hidden sm:inline-flex"
          >
            View Availability
          </UButton>
          <UButton to="/memberships">
            Join
          </UButton>
          <NuxtLink
            to="/login"
            class="ml-2 hidden text-sm text-[color:var(--gruv-ink-2)] transition-colors hover:text-[color:var(--gruv-accent)] md:inline"
          >
            Login
          </NuxtLink>
        </template>

        <!-- Logged IN state -->
        <template v-else>
          <UButton
            color="neutral"
            variant="soft"
            to="/dashboard"
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
              class="hidden md:inline-flex"
            />
          </UDropdownMenu>
        </template>

        <!-- Mobile menu button (always shown) -->
        <UButton
          icon="i-heroicons-bars-3"
          color="neutral"
          variant="ghost"
          aria-label="Menu"
          class="md:hidden"
          @click="isOpen = !isOpen"
        />
      </div>
    </UContainer>

    <!-- Mobile menu -->
    <div
      v-if="isOpen"
      class="border-t border-[color:var(--gruv-line)] bg-[rgba(249,245,215,0.96)] backdrop-blur dark:bg-[rgba(29,32,33,0.98)] md:hidden"
    >
      <UContainer class="space-y-1 py-4">
        <NuxtLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="block rounded px-3 py-2 text-sm transition-colors"
          :class="route.path === l.to
            ? 'bg-[rgba(181,118,20,0.14)] text-[color:var(--gruv-ink-0)]'
            : 'text-[color:var(--gruv-ink-2)] hover:bg-[rgba(181,118,20,0.08)]'"
          @click="isOpen = false"
        >
          {{ l.label }}
        </NuxtLink>

        <div class="my-2 border-t border-[color:var(--gruv-line)]" />

        <!-- Mobile: logged out -->
        <template v-if="!isAuthed">
          <NuxtLink
            to="/login"
            class="block rounded px-3 py-2 text-sm text-[color:var(--gruv-ink-2)] hover:bg-[rgba(181,118,20,0.08)]"
            @click="isOpen = false"
          >
            Login
          </NuxtLink>
          <NuxtLink
            to="/memberships"
            class="block rounded px-3 py-2 text-sm text-[color:var(--gruv-ink-2)] hover:bg-[rgba(181,118,20,0.08)]"
            @click="isOpen = false"
          >
            Join
          </NuxtLink>
        </template>

        <!-- Mobile: logged in -->
        <template v-else>
          <p class="truncate px-3 py-1 text-xs font-medium text-[color:var(--gruv-ink-2)]">
            {{ displayName }}
          </p>
          <NuxtLink
            to="/dashboard"
            class="block rounded px-3 py-2 text-sm font-medium text-[color:var(--gruv-ink-0)] hover:bg-[rgba(181,118,20,0.08)]"
            @click="isOpen = false"
          >
            Dashboard
          </NuxtLink>
          <NuxtLink
            to="/dashboard/bookings"
            class="block rounded px-3 py-2 text-sm text-[color:var(--gruv-ink-2)] hover:bg-[rgba(181,118,20,0.08)]"
            @click="isOpen = false"
          >
            My Bookings
          </NuxtLink>
          <NuxtLink
            to="/dashboard/membership"
            class="block rounded px-3 py-2 text-sm text-[color:var(--gruv-ink-2)] hover:bg-[rgba(181,118,20,0.08)]"
            @click="isOpen = false"
          >
            Membership &amp; Credits
          </NuxtLink>
          <NuxtLink
            to="/dashboard/profile"
            class="block rounded px-3 py-2 text-sm text-[color:var(--gruv-ink-2)] hover:bg-[rgba(181,118,20,0.08)]"
            @click="isOpen = false"
          >
            Profile
          </NuxtLink>
          <NuxtLink
            v-if="isAdmin"
            to="/dashboard/admin"
            class="block rounded px-3 py-2 text-sm text-[color:var(--gruv-ink-2)] hover:bg-[rgba(181,118,20,0.08)]"
            @click="isOpen = false"
          >
            Admin
          </NuxtLink>
          <button
            class="block w-full rounded px-3 py-2 text-left text-sm text-[color:var(--gruv-rust)] hover:bg-[rgba(157,0,6,0.08)]"
            @click="logout"
          >
            Log out
          </button>
        </template>
      </UContainer>
    </div>
  </header>
</template>
