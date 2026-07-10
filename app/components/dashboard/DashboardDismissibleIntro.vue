<script setup lang="ts">
const props = withDefaults(defineProps<{
  storageKey: string
  title: string
  description?: string
  icon?: string
  color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  variant?: 'solid' | 'outline' | 'soft' | 'subtle'
}>(), {
  description: undefined,
  icon: 'i-lucide-info',
  color: 'info',
  variant: 'soft'
})

const slots = useSlots()
const generatedId = useId()
const announcement = ref('')
const resolvedStorageKey = `fostudio.dashboardIntro.${props.storageKey}`
const dismissalCookie = useCookie<'dismissed' | null>(`fostudio_dashboard_intro_${props.storageKey}`, {
  default: () => null,
  path: '/',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365
})

const titleId = `dashboard-intro-title-${generatedId}`
const descriptionId = `dashboard-intro-description-${generatedId}`
const visible = computed(() => dismissalCookie.value !== 'dismissed')
const hasDescription = computed(() => Boolean(props.description || slots.description))

onMounted(() => {
  if (dismissalCookie.value) return

  try {
    if (localStorage.getItem(resolvedStorageKey) === 'dismissed') {
      dismissalCookie.value = 'dismissed'
    }
  } catch {
    // Cookie state remains the deterministic source when storage is unavailable.
  }
})

function dismiss() {
  dismissalCookie.value = 'dismissed'
  announcement.value = `${props.title} dismissed`

  if (!import.meta.client) return
  try {
    localStorage.setItem(resolvedStorageKey, 'dismissed')
  } catch {
    // The server-readable cookie already persisted the preference.
  }
}
</script>

<template>
  <AppAlert
    v-if="visible"
    class="app-status"
    :color="color"
    :variant="variant"
    :icon="icon"
    role="region"
    :aria-labelledby="titleId"
    :aria-describedby="hasDescription ? descriptionId : undefined"
    :data-status-tone="color"
  >
    <template #title>
      <span :id="titleId">{{ title }}</span>
    </template>

    <template
      v-if="hasDescription"
      #description
    >
      <div :id="descriptionId">
        <slot name="description">
          {{ description }}
        </slot>
      </div>
    </template>

    <template #actions>
      <div class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          :aria-label="`Dismiss ${title}`"
          @click="dismiss"
        >
          Dismiss
        </UButton>
      </div>
    </template>
  </AppAlert>

  <p
    class="visually-hidden"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {{ announcement }}
  </p>
</template>
