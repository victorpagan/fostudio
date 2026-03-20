<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type GoogleCalendarSettings = {
  enabled: boolean
  pushEnabled: boolean
  calendarId: string
  oauthClientId: string
  oauthClientSecretName: string
  oauthConnected: boolean
  oauthConnectedEmail: string | null
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

type GoogleCalendarOption = {
  id: string
  summary: string
  primary: boolean
  accessRole: string
}

const toast = useToast()
const route = useRoute()
const saving = ref(false)
const syncing = ref(false)
const testing = ref(false)
const loadingCalendars = ref(false)
const calendarsError = ref<string | null>(null)
const statsError = ref<string | null>(null)
const calendarOptions = ref<GoogleCalendarOption[]>([])

const form = reactive<GoogleCalendarSettings>({
  enabled: false,
  pushEnabled: false,
  calendarId: '',
  oauthClientId: '',
  oauthClientSecretName: 'GOOGLE_OAUTH_CLIENT_SECRET',
  oauthConnected: false,
  oauthConnectedEmail: null,
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
  const res = await $fetch<{
    settings: GoogleCalendarSettings
    stats: GoogleCalendarStats
    calendars: GoogleCalendarOption[]
    calendarsError: string | null
    statsError: string | null
  }>('/api/admin/google-calendar/settings')
  form.enabled = Boolean(res.settings.enabled)
  form.pushEnabled = Boolean(res.settings.pushEnabled)
  form.calendarId = String(res.settings.calendarId ?? '')
  form.oauthClientId = String(res.settings.oauthClientId ?? '')
  form.oauthClientSecretName = String(res.settings.oauthClientSecretName ?? 'GOOGLE_OAUTH_CLIENT_SECRET')
  form.oauthConnected = Boolean(res.settings.oauthConnected)
  form.oauthConnectedEmail = res.settings.oauthConnectedEmail ?? null
  form.serviceAccountSecretName = String(res.settings.serviceAccountSecretName ?? 'GOOGLE_SERVICE_ACCOUNT_JSON')
  form.lookbackDays = Number(res.settings.lookbackDays ?? 14)
  form.lookaheadDays = Number(res.settings.lookaheadDays ?? 180)
  form.syncIntervalMinutes = Number(res.settings.syncIntervalMinutes ?? 5)
  form.lastSyncAt = res.settings.lastSyncAt ?? null
  form.lastSyncStatus = res.settings.lastSyncStatus ?? null
  calendarOptions.value = Array.isArray(res.calendars) ? res.calendars : []
  calendarsError.value = res.calendarsError ?? null
  statsError.value = res.statsError ?? null
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

const oauthConnectedLabel = computed(() => {
  if (!form.oauthConnected) return 'Not connected'
  if (form.oauthConnectedEmail) return `Connected as ${form.oauthConnectedEmail}`
  return 'Connected'
})

onMounted(() => {
  const oauth = typeof route.query.oauth === 'string' ? route.query.oauth : ''
  const message = typeof route.query.message === 'string' ? route.query.message : ''
  const email = typeof route.query.email === 'string' ? route.query.email : ''
  if (!oauth) return
  if (oauth === 'connected') {
    toast.add({
      title: 'Google Calendar connected',
      description: email ? `Connected as ${email}` : 'OAuth connection completed.',
      color: 'success'
    })
  } else if (oauth === 'error') {
    toast.add({
      title: 'Google Calendar connect failed',
      description: message || 'Could not complete OAuth connect.',
      color: 'error'
    })
  }
})

async function saveSettings() {
  saving.value = true
  try {
    await $fetch('/api/admin/google-calendar/settings.upsert', {
      method: 'POST',
      body: {
        enabled: form.enabled,
        pushEnabled: form.pushEnabled,
        calendarId: form.calendarId,
        oauthClientId: form.oauthClientId,
        oauthClientSecretName: form.oauthClientSecretName,
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

const calendarSelectItems = computed(() => {
  const items = calendarOptions.value.map(calendar => ({
    value: calendar.id,
    label: `${calendar.summary}${calendar.primary ? ' (Primary)' : ''} · ${calendar.id}`
  }))
  const selected = form.calendarId.trim()
  if (selected && !items.some(item => item.value === selected)) {
    items.unshift({
      value: selected,
      label: `Saved calendar · ${selected}`
    })
  }
  return items
})

async function refreshGoogleCalendars() {
  if (!form.oauthConnected) {
    calendarOptions.value = []
    calendarsError.value = null
    return
  }

  loadingCalendars.value = true
  try {
    const res = await $fetch<{ calendars: GoogleCalendarOption[], error: string | null }>('/api/admin/google-calendar/calendars')
    calendarOptions.value = Array.isArray(res.calendars) ? res.calendars : []
    calendarsError.value = res.error ?? null
  } catch (error: unknown) {
    calendarsError.value = readErrorMessage(error)
  } finally {
    loadingCalendars.value = false
  }
}

async function startOauthConnect() {
  await navigateTo('/api/admin/google-calendar/oauth/start', { external: true })
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
            @click="refresh"
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

        <UAlert
          v-if="statsError"
          color="warning"
          variant="soft"
          icon="i-lucide-circle-alert"
          title="Google sync stats unavailable"
          :description="statsError"
        />

        <UCard>
          <div class="grid gap-3 md:grid-cols-2">
            <UFormField label="Enable sync">
              <USwitch v-model="form.enabled" />
            </UFormField>

            <UFormField label="Push FO Studio busy blocks to Google">
              <USwitch v-model="form.pushEnabled" />
            </UFormField>

            <UFormField label="Google Calendar ID">
              <UInput v-model="form.calendarId" placeholder="your-calendar-id@group.calendar.google.com" />
            </UFormField>

            <UFormField v-if="form.oauthConnected" label="Select Google calendar">
              <div class="space-y-2">
                <USelect
                  v-model="form.calendarId"
                  :items="calendarSelectItems"
                  option-attribute="label"
                  value-attribute="value"
                  :disabled="loadingCalendars || calendarSelectItems.length === 0"
                />
                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    :loading="loadingCalendars"
                    @click="refreshGoogleCalendars"
                  >
                    Refresh calendars
                  </UButton>
                  <span v-if="!loadingCalendars && calendarSelectItems.length === 0" class="text-xs text-dimmed">
                    No calendars returned for this account.
                  </span>
                </div>
                <p v-if="calendarsError" class="text-xs text-error">
                  {{ calendarsError }}
                </p>
              </div>
            </UFormField>

            <UFormField label="Google OAuth Client ID">
              <UInput v-model="form.oauthClientId" placeholder="1234567890-xxxx.apps.googleusercontent.com" />
            </UFormField>

            <UFormField label="OAuth client secret key name">
              <UInput v-model="form.oauthClientSecretName" placeholder="GOOGLE_OAUTH_CLIENT_SECRET" />
            </UFormField>

            <UFormField label="OAuth connection">
              <div class="flex items-center gap-2">
                <UBadge
                  :color="form.oauthConnected ? 'success' : 'neutral'"
                  variant="soft"
                  :label="oauthConnectedLabel"
                />
                <UButton
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-link"
                  @click="startOauthConnect"
                >
                  Connect to Google Calendar
                </UButton>
              </div>
            </UFormField>

            <UFormField label="Service account secret key name (fallback)">
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
            <div v-if="lastSyncSummary">
              {{ lastSyncSummary }}
            </div>
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
