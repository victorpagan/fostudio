<script setup lang="ts">
type AsyncStatus = 'idle' | 'loading' | 'empty' | 'error' | 'success'
type StatusColor = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'primary'

const props = withDefaults(defineProps<{
  state?: AsyncStatus
  title?: string | null
  description?: string | null
  icon?: string | null
  color?: StatusColor
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

const resolvedColor = computed<StatusColor>(() => {
  if (props.color) return props.color

  switch (props.state) {
    case 'error':
      return 'error'
    case 'success':
      return 'success'
    default:
      return 'neutral'
  }
})

const resolvedIcon = computed(() => {
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

const resolvedTitle = computed(() => {
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
const liveRole = computed(() => props.state === 'error' ? 'alert' : 'status')
const liveMode = computed(() => props.state === 'error' ? 'assertive' : 'polite')
</script>

<template>
  <div class="space-y-3">
    <AppAlert
      v-if="showState"
      class="app-status"
      variant="soft"
      :color="resolvedColor"
      :icon="resolvedIcon"
      :title="resolvedTitle"
      :description="description || undefined"
      :role="liveRole"
      :aria-live="liveMode"
      :aria-busy="state === 'loading' || undefined"
      aria-atomic="true"
      :data-status-tone="resolvedColor"
      :ui="{ icon: state === 'loading' ? 'animate-spin' : undefined }"
    >
      <template
        v-if="$slots.title"
        #title
      >
        <slot name="title" />
      </template>

      <template
        v-if="$slots.description"
        #description
      >
        <slot name="description" />
      </template>

      <template
        v-if="$slots.actions || showRetry"
        #actions
      >
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
    </AppAlert>

    <slot />
  </div>
</template>
