<script setup lang="ts">
type RunResponse = {
  ok: boolean
  scope?: 'weekly' | 'monthly' | 'refresh'
  generatedAt?: string | null
  artifacts?: string[]
  summary?: {
    revenue_total: number
    new_members: number
    active_members: number
  }
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
  scope?: 'weekly' | 'monthly' | 'refresh'
}>(), {
  size: 'sm',
  requireSupabase: true,
  scope: 'weekly'
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
      query: {
        scope: props.scope
      },
      body: {
        requireSupabase: props.requireSupabase
      }
    })

    toast.add({
      title: 'Analytics pipeline completed',
      description: `${payload.scope ?? props.scope} • ${payload.outputs.storage} (${payload.outputs.source ?? 'n/a'}) in ${(payload.run.durationMs / 1000).toFixed(1)}s`,
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
