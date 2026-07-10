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
</script>

<template>
  <AsyncState
    v-bind="props"
    @retry="emit('retry')"
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
      v-if="$slots.actions"
      #actions
    >
      <slot name="actions" />
    </template>

    <template
      v-if="$slots.default"
      #default
    >
      <slot />
    </template>
  </AsyncState>
</template>
