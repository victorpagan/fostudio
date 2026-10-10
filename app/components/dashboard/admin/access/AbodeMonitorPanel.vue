<script setup lang="ts">
import { formatAdminDateTime } from '~/utils/adminTime'

type MonitorState = { monitor_key: string, state: string, checked_at: string, details: { verifiedAt?: string, message?: string, jobId?: number } }
type MonitorEvent = { id: number, monitor_key: string, state: string, previous_state: string | null, created_at: string, notified_at: string | null, notify_error: string | null }
const snapshot = ref<{ states: MonitorState[], events: MonitorEvent[], failures24h: number, failures7d: number } | null>(null)
const failed = ref(false)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
let loading = false
async function refresh() {
  now.value = Date.now()
  if (document.hidden || loading) return
  loading = true
  try {
    snapshot.value = await $fetch('/api/admin/access/monitor')
    failed.value = false
  } catch {
    failed.value = true
  } finally {
    loading = false
  }
}
const connection = computed(() => snapshot.value?.states.find(row => row.monitor_key === 'abode-connection'))
const stale = computed(() => !connection.value || now.value - Date.parse(connection.value.checked_at) > 10 * 60000)
onMounted(() => {
  void refresh()
  timer = setInterval(refresh, 30000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-medium">
          Abode monitoring
        </h3>
        <UBadge :color="failed || stale || connection?.state !== 'Ready' ? 'warning' : 'neutral'">
          {{ failed || stale ? 'Degraded / monitoring stale' : connection?.state === 'Ready' ? 'Reachable; see command verification' : connection?.state }}
        </UBadge>
      </div>
    </template>
    <p class="text-sm text-muted">
      Read-only checks never test-arm the alarm. A restored connection does not confirm that an arming command will succeed.
    </p>
    <p
      v-if="failed"
      class="mt-2 text-sm text-warning"
    >
      Monitoring unavailable. Check migration, scheduler, and HA package installation.
    </p>
    <p
      v-if="connection"
      class="mt-2 text-sm"
    >
      Last external check: {{ formatAdminDateTime(connection.checked_at) }}
    </p>
    <div class="mt-3 grid gap-2 sm:grid-cols-3">
      <div
        v-for="state in ['armed_away', 'armed_home', 'disarmed']"
        :key="state"
        class="rounded border border-default p-3 text-sm"
      >
        <div class="font-medium">
          Last verified {{ state.replaceAll('_', ' ') }}
        </div>
        {{ formatAdminDateTime(snapshot?.states.find(row => row.monitor_key === `last-verified:${state}`)?.details.verifiedAt ?? null) }}
      </div>
    </div>
    <p class="mt-3 text-sm">
      Alarm incident reports: {{ snapshot?.failures24h ?? 'Unknown' }} in 24h / {{ snapshot?.failures7d ?? 'Unknown' }} in 7 days. Historical duplicate reports may be included.
    </p>
    <ul class="mt-3 space-y-2 text-sm">
      <li
        v-for="entry in snapshot?.events"
        :key="entry.id"
        class="rounded border border-default p-2"
      >
        {{ entry.monitor_key }}: {{ entry.previous_state ?? 'Initial observation' }} → {{ entry.state }}
        <div class="text-xs text-muted">
          {{ formatAdminDateTime(entry.created_at) }} · {{ entry.notified_at ? 'Staff email sent' : entry.notify_error ? 'Email failed; retry pending' : 'Email queued' }}
        </div>
      </li>
    </ul>
  </UCard>
</template>
