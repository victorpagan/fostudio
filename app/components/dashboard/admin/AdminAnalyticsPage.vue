<script setup lang="ts">
const props = withDefaults(defineProps<{
  panelId: string
  title: string
  busy?: boolean
  error?: unknown
}>(), {
  busy: false
})

const emit = defineEmits<{
  retry: []
}>()

const errorMessage = computed(() => {
  if (!props.error) return null
  if (props.error instanceof Error) return props.error.message
  if (typeof props.error === 'object') {
    const value = props.error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    return value.data?.statusMessage ?? value.statusMessage ?? value.message ?? 'Analytics could not be loaded.'
  }
  return String(props.error)
})
</script>

<template>
  <DashboardPageScaffold
    :panel-id="panelId"
    :title="title"
    :busy="busy"
  >
    <template #right>
      <slot name="actions" />
    </template>

    <div class="space-y-4">
      <AnalyticsSubnav />

      <DashboardSectionState
        v-if="errorMessage"
        state="error"
        title="Analytics unavailable"
        :description="`${errorMessage} Existing values are hidden so a failed refresh is not mistaken for current data.`"
        show-retry
        @retry="emit('retry')"
      />
      <slot v-else />
    </div>
  </DashboardPageScaffold>
</template>
