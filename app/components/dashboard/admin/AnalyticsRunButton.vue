<script setup lang="ts">
type RunResponse = {
  ok: boolean
  run: {
    durationMs: number
  }
  outputs: {
    generatedAt: string | null
    freshness: 'fresh' | 'stale' | 'missing'
    storage: 'supabase' | 'filesystem'
    source: string | null
    missingFiles: string[]
  }
}

const props = withDefaults(defineProps<{
  size?: 'xs' | 'sm' | 'md'
  requireSupabase?: boolean
}>(), {
  size: 'sm',
  requireSupabase: true
})

const emit = defineEmits<{
  completed: [payload: RunResponse]
}>()

const toast = useToast()
const running = ref(false)

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return maybe.data?.statusMessage ?? maybe.statusMessage ?? maybe.message ?? 'Unknown error'
}

async function runAnalytics() {
  if (running.value) return
  running.value = true

  try {
    const payload = await $fetch<RunResponse>('/api/admin/analytics/run', {
      method: 'POST',
      body: {
        requireSupabase: props.requireSupabase
      }
    })

    toast.add({
      title: 'Analytics pipeline completed',
      description: `${payload.outputs.storage} (${payload.outputs.source ?? 'n/a'}) in ${(payload.run.durationMs / 1000).toFixed(1)}s`,
      color: 'success'
    })

    emit('completed', payload)
  } catch (error: unknown) {
    toast.add({
      title: 'Analytics pipeline failed',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    running.value = false
  }
}
</script>

<template>
  <UButton
    :size="size"
    color="primary"
    variant="soft"
    icon="i-lucide-play"
    :loading="running"
    @click="runAnalytics"
  >
    Run analytics
  </UButton>
</template>
