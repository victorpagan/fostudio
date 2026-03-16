<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type GoogleCalendarSettings = {
  enabled: boolean
  calendarId: string
  serviceAccountSecretName: string
  lookbackDays: number
  lookaheadDays: number
  syncIntervalMinutes: number
  lastSyncAt: string | null
  lastSyncStatus: unknown
}

type GoogleCalendarStats = {
  activeSyncedEvents: number
  nextWeekEvents: number
}

const toast = useToast()
const saving = ref(false)
const syncing = ref(false)
const testing = ref(false)

const form = reactive<GoogleCalendarSettings>({
  enabled: false,
  calendarId: '',
  serviceAccountSecretName: 'GOOGLE_SERVICE_ACCOUNT_JSON',
  lookbackDays: 14,
  lookaheadDays: 180,
  syncIntervalMinutes: 5,
  lastSyncAt: null,
  lastSyncStatus: null
})

const stats = reactive<GoogleCalendarStats>({
  activeSyncedEvents: 0,
  nextWeekEvents: 0
})

const { pending, refresh } = await useAsyncData('admin:gcal:settings', async () => {
  const res = await $fetch<{ settings: GoogleCalendarSettings, stats: GoogleCalendarStats }>('/api/admin/google-calendar/settings')
  form.enabled = Boolean(res.settings.enabled)
  form.calendarId = String(res.settings.calendarId ?? '')
  form.serviceAccountSecretName = String(res.settings.serviceAccountSecretName ?? 'GOOGLE_SERVICE_ACCOUNT_JSON')
  form.lookbackDays = Number(res.settings.lookbackDays ?? 14)
  form.lookaheadDays = Number(res.settings.lookaheadDays ?? 180)
  form.syncIntervalMinutes = Number(res.settings.syncIntervalMinutes ?? 5)
  form.lastSyncAt = res.settings.lastSyncAt ?? null
  form.lastSyncStatus = res.settings.lastSyncStatus ?? null
  stats.activeSyncedEvents = Number(res.stats.activeSyncedEvents ?? 0)
  stats.nextWeekEvents = Number(res.stats.nextWeekEvents ?? 0)
  return res
})

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function formatLastSync(value: string | null) {
  if (!value) return 'Never'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

const lastSyncSummary = computed(() => {
  const raw = form.lastSyncStatus
  if (!raw || typeof raw !== 'object') return null
  const status = raw as Record<string, unknown>
  const ok = Boolean(status.ok)
  const reason = typeof status.reason === 'string' ? status.reason : null
  const fetched = Number(status.fetchedEvents ?? 0)
  const written = Number(status.upsertedRows ?? 0)
  const message = typeof status.error === 'string' ? status.error : null

  if (!ok && message) return `Last sync failed: ${message}`
  if (reason === 'cooldown') return 'Last sync skipped due to cooldown.'
  if (reason === 'disabled') return 'Sync is disabled.'
  return `Fetched ${fetched} events · upserted ${written} rows`
})

async function saveSettings() {
  saving.value = true
  try {
    await $fetch('/api/admin/google-calendar/settings.upsert', {
      method: 'POST',
      body: {
        enabled: form.enabled,
        calendarId: form.calendarId,
        serviceAccountSecretName: form.serviceAccountSecretName,
        lookbackDays: form.lookbackDays,
        lookaheadDays: form.lookaheadDays,
        syncIntervalMinutes: form.syncIntervalMinutes
      }
    })
    toast.add({ title: 'Google Calendar settings saved' })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save settings',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true
  try {
    const res = await $fetch<{ result: { fetchedEvents: number } }>('/api/admin/google-calendar/test', {
      method: 'POST',
      body: {}
    })
    toast.add({
      title: 'Connection successful',
      description: `Fetched ${res.result.fetchedEvents} events in dry-run mode.`,
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: 'Connection test failed',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    testing.value = false
  }
}

async function syncNow() {
  syncing.value = true
  try {
    const res = await $fetch<{ result: { fetchedEvents: number, upsertedRows: number, deactivatedRows: number } }>('/api/admin/google-calendar/sync', {
      method: 'POST',
      body: { force: true }
    })
    toast.add({
      title: 'Google Calendar synced',
      description: `Fetched ${res.result.fetchedEvents}, wrote ${res.result.upsertedRows}, deactivated ${res.result.deactivatedRows}.`,
      color: 'success'
    })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Sync failed',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="admin-google-calendar">
    <template #header>
      <UDashboardNavbar title="Google Calendar Sync" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-calendar-sync"
          title="Peerspace mirror from Google Calendar"
          description="Sync a designated Google Calendar into the booking calendar as non-bookable external blocks."
        />

        <div class="grid gap-4 md:grid-cols-2">
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Active synced events
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ stats.activeSyncedEvents }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Next 7 days
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ stats.nextWeekEvents }}
            </div>
          </UCard>
        </div>

        <UCard>
          <div class="grid gap-3 md:grid-cols-2">
            <UFormField label="Enable sync">
              <USwitch v-model="form.enabled" />
            </UFormField>

            <UFormField label="Google Calendar ID">
              <UInput v-model="form.calendarId" placeholder="your-calendar-id@group.calendar.google.com" />
            </UFormField>

            <UFormField label="Service account secret key name">
              <UInput v-model="form.serviceAccountSecretName" placeholder="GOOGLE_SERVICE_ACCOUNT_JSON" />
            </UFormField>

            <UFormField label="Sync interval (minutes)">
              <UInput v-model.number="form.syncIntervalMinutes" type="number" min="1" max="1440" />
            </UFormField>

            <UFormField label="Lookback window (days)">
              <UInput v-model.number="form.lookbackDays" type="number" min="0" max="365" />
            </UFormField>

            <UFormField label="Lookahead window (days)">
              <UInput v-model.number="form.lookaheadDays" type="number" min="1" max="730" />
            </UFormField>
          </div>

          <div class="mt-4 space-y-1 text-xs text-dimmed">
            <div>Last sync: {{ formatLastSync(form.lastSyncAt) }}</div>
            <div v-if="lastSyncSummary">{{ lastSyncSummary }}</div>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <UButton :loading="saving" @click="saveSettings">
              Save settings
            </UButton>
            <UButton color="neutral" variant="soft" :loading="testing" @click="testConnection">
              Test connection
            </UButton>
            <UButton color="neutral" variant="soft" :loading="syncing" @click="syncNow">
              Sync now
            </UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
