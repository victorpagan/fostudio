<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{ collapsed?: boolean }>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()

const colorMode = useColorMode()
const appConfig = useAppConfig()

const colors = ['error', 'orange', 'warning', 'yellow', 'lime', 'success', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const neutrals = ['slate', 'neutral', 'zinc', 'neutral', 'stone']

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
    label: 'Theme',
    icon: 'i-lucide-palette',
    children: [{
      label: 'Primary',
      slot: 'chip',
      chip: appConfig.ui.colors.primary,
      content: { align: 'center', collisionPadding: 16 },
      children: colors.map(color => ({
        label: color,
        chip: color,
        slot: 'chip',
        checked: appConfig.ui.colors.primary === color,
        type: 'checkbox',
        onSelect: (e: Event) => {
          e.preventDefault()
          appConfig.ui.colors.primary = color
        }
      }))
    }, {
      label: 'Neutral',
      slot: 'chip',
      chip: appConfig.ui.colors.neutral === 'neutral' ? 'old-neutral' : appConfig.ui.colors.neutral,
      content: { align: 'end', collisionPadding: 16 },
      children: neutrals.map(color => ({
        label: color,
        chip: color === 'neutral' ? 'old-neutral' : color,
        slot: 'chip',
        type: 'checkbox',
        checked: appConfig.ui.colors.neutral === color,
        onSelect: (e: Event) => {
          e.preventDefault()
          appConfig.ui.colors.neutral = color
        }
      }))
    }]
  }, {
    label: 'Appearance',
    icon: 'i-lucide-sun-moon',
    children: [{
      label: 'Light',
      icon: 'i-lucide-sun',
      type: 'checkbox',
      checked: colorMode.value === 'light',
      onSelect: (e: Event) => {
        e.preventDefault()
        colorMode.preference = 'light'
      }
    }, {
      label: 'Dark',
      icon: 'i-lucide-moon',
      type: 'checkbox',
      checked: colorMode.value === 'dark',
      onUpdateChecked: (checked: boolean) => {
        if (checked) colorMode.preference = 'dark'
      },
      onSelect: (e: Event) => {
        e.preventDefault()
      }
    }]
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
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-56' : 'w-(--reka-dropdown-menu-trigger-width)' }"
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

    <!-- ✅ IMPORTANT: slot templates must be INSIDE the component -->
    <template #chip-leading="{ item }">
      <div class="inline-flex items-center justify-center shrink-0 size-5">
        <span
          class="rounded-full ring ring-bg bg-(--chip-light) dark:bg-(--chip-dark) size-2"
          :style="{
            '--chip-light': `var(--color-${(item as any).chip}-500)`,
            '--chip-dark': `var(--color-${(item as any).chip}-400)`
          }"
        />
      </div>
    </template>
  </UDropdownMenu>
</template>
