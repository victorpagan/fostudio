<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{ collapsed?: boolean }>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const colorMode = useColorMode()

const { data: customer } = await useAsyncData('userMenuCustomer', async () => {
  if (!user.value) return null
  const { data } = await supabase
    .from('customers')
    .select('first_name,last_name,email')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  return data
})

const displayName = computed(() => {
  const fn = customer.value?.first_name?.trim()
  const ln = customer.value?.last_name?.trim()
  const full = [fn, ln].filter(Boolean).join(' ')
  return full || customer.value?.email || user.value?.email || 'Account'
})

const avatar = computed(() => ({
  alt: displayName.value
}))

async function logout() {
  await supabase.auth.signOut()
  await router.push('/login')
}

const items = computed<DropdownMenuItem[][]>(() => ([
  [{
    type: 'label',
    label: displayName.value,
    avatar: avatar.value
  }],
  [{
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/dashboard/profile'
  }, {
    label: 'Membership & Credits',
    icon: 'i-lucide-badge-check',
    to: '/dashboard/membership'
  }],
  [{
    label: 'Log out',
    icon: 'i-lucide-log-out',
    onSelect: (e: Event) => {
      e.preventDefault()
      logout()
    }
  }]
]))
</script>

<template>
  <div
    class="flex items-center gap-2"
    :class="collapsed ? 'justify-center' : 'w-full'"
  >
    <UDropdownMenu
      :items="items"
      :content="{ align: 'center', collisionPadding: 12 }"
      :ui="{ content: collapsed ? 'w-56' : 'w-(--reka-dropdown-menu-trigger-width)' }"
      :class="collapsed ? '' : 'min-w-0 flex-1'"
    >
      <UButton
        v-bind="{
          label: collapsed ? undefined : displayName,
          trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down'
        }"
        :avatar="avatar"
        color="neutral"
        variant="ghost"
        block
        :square="collapsed"
        class="data-[state=open]:bg-elevated"
        :ui="{ trailingIcon: 'text-dimmed' }"
      />
    </UDropdownMenu>

    <UColorModeButton
      color="neutral"
      variant="ghost"
      :aria-label="colorMode.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    />
  </div>
</template>
