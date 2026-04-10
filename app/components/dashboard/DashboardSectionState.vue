<script setup lang="ts">
type SectionState = 'idle' | 'loading' | 'empty' | 'error' | 'success'

const props = withDefaults(defineProps<{
  state?: SectionState
  title?: string | null
  description?: string | null
  icon?: string | null
  color?: 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'primary'
  retryLabel?: string
  showRetry?: boolean
}>(), {
  state: 'idle',
  title: null,
  description: null,
  icon: null,
  color: undefined,
  retryLabel: 'Retry',
  showRetry: false
})

const emit = defineEmits<{
  retry: []
}>()

const computedColor = computed(() => {
  if (props.color) return props.color
  switch (props.state) {
    case 'error':
      return 'error'
    case 'success':
      return 'success'
    case 'loading':
      return 'neutral'
    default:
      return 'neutral'
  }
})

const computedIcon = computed(() => {
  if (props.icon) return props.icon
  switch (props.state) {
    case 'loading':
      return 'i-lucide-loader-circle'
    case 'empty':
      return 'i-lucide-inbox'
    case 'error':
      return 'i-lucide-circle-alert'
    case 'success':
      return 'i-lucide-circle-check'
    default:
      return 'i-lucide-info'
  }
})

const computedTitle = computed(() => {
  if (props.title) return props.title
  switch (props.state) {
    case 'loading':
      return 'Loading'
    case 'empty':
      return 'Nothing to show'
    case 'error':
      return 'Something went wrong'
    case 'success':
      return 'Done'
    default:
      return undefined
  }
})

const showState = computed(() => props.state !== 'idle')
</script>

<template>
  <div class="space-y-3">
    <UAlert
      v-if="showState"
      variant="soft"
      :color="computedColor"
      :icon="computedIcon"
      :title="computedTitle || undefined"
      :description="description || undefined"
    >
      <template #actions>
        <slot name="actions" />
        <UButton
          v-if="showRetry"
          size="xs"
          color="neutral"
          variant="soft"
          @click="emit('retry')"
        >
          {{ retryLabel }}
        </UButton>
      </template>
    </UAlert>

    <slot />
  </div>
</template>
