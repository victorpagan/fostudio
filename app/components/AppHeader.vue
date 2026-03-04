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
    { label: 'Membership', icon: 'i-lucide-badge-check', to: '/dashboard/membership' },
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
  <header class="sticky top-0 z-50 border-b border-gray-200/60 bg-white/75 backdrop-blur dark:border-gray-800/60 dark:bg-gray-950/75">
    <UContainer class="flex h-16 items-center justify-between">
      <NuxtLink
        to="/"
        class="flex items-center gap-2"
      >
        <div class="h-9 w-9 rounded-xl bg-gray-900 dark:bg-gray-100" />
        <span class="font-semibold tracking-tight">FO Studio</span>
      </NuxtLink>

      <!-- Desktop nav -->
      <nav class="hidden items-center gap-6 md:flex">
        <NuxtLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="text-sm transition-colors"
          :class="route.path === l.to
            ? 'text-gray-900 dark:text-white'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'"
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
            class="ml-2 hidden text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white md:inline"
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
      class="border-t border-gray-200/60 bg-white/75 backdrop-blur dark:border-gray-800/60 dark:bg-gray-950/75 md:hidden"
    >
      <UContainer class="space-y-1 py-4">
        <NuxtLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          class="block rounded px-3 py-2 text-sm transition-colors"
          :class="route.path === l.to
            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
            : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900'"
          @click="isOpen = false"
        >
          {{ l.label }}
        </NuxtLink>

        <div class="my-2 border-t border-gray-200/60 dark:border-gray-800/60" />

        <!-- Mobile: logged out -->
        <template v-if="!isAuthed">
          <NuxtLink
            to="/login"
            class="block rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
            @click="isOpen = false"
          >
            Login
          </NuxtLink>
          <NuxtLink
            to="/memberships"
            class="block rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
            @click="isOpen = false"
          >
            Join
          </NuxtLink>
        </template>

        <!-- Mobile: logged in -->
        <template v-else>
          <p class="px-3 py-1 text-xs font-medium text-gray-400 dark:text-gray-500 truncate">
            {{ displayName }}
          </p>
          <NuxtLink
            to="/dashboard"
            class="block rounded px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 dark:text-white dark:hover:bg-gray-900"
            @click="isOpen = false"
          >
            Dashboard
          </NuxtLink>
          <NuxtLink
            to="/dashboard/bookings"
            class="block rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
            @click="isOpen = false"
          >
            My Bookings
          </NuxtLink>
          <NuxtLink
            to="/dashboard/membership"
            class="block rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
            @click="isOpen = false"
          >
            Membership
          </NuxtLink>
          <NuxtLink
            to="/dashboard/profile"
            class="block rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
            @click="isOpen = false"
          >
            Profile
          </NuxtLink>
          <NuxtLink
            v-if="isAdmin"
            to="/dashboard/admin"
            class="block rounded px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-900"
            @click="isOpen = false"
          >
            Admin
          </NuxtLink>
          <button
            class="block w-full rounded px-3 py-2 text-left text-sm text-red-500 hover:bg-gray-50 dark:text-red-400 dark:hover:bg-gray-900"
            @click="logout"
          >
            Log out
          </button>
        </template>
      </UContainer>
    </div>
  </header>
</template>
