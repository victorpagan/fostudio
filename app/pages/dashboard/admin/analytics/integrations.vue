<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type AdsIntegrationSettings = {
  syncEnabled: boolean
  lookbackDays: number
  google: {
    enabled: boolean
    customerId: string
    loginCustomerId: string
    apiVersion: string
    developerTokenSecretName: string
    clientIdSecretName: string
    clientSecretSecretName: string
    refreshTokenSecretName: string
  }
  meta: {
    enabled: boolean
    adAccountId: string
    apiVersion: string
    accessTokenSecretName: string
    conversionActionTypes: string[]
  }
  lastSyncAt: string | null
  lastSyncStatus: unknown
}

type ProviderSummary = {
  platform?: string
  enabled?: boolean
  ok?: boolean
  skippedReason?: string | null
  error?: string | null
  fetchedRows?: number
  upsertedRows?: number
}

type SyncResponse = {
  ok: boolean
  dryRun: boolean
  durationMs: number
  summary: {
    ok?: boolean
    generatedAt?: string
    providers?: ProviderSummary[]
    totals?: {
      fetchedRows?: number
      upsertedRows?: number
    }
  } | null
}

const toast = useToast()
const saving = ref(false)
const syncing = ref(false)

const form = reactive<AdsIntegrationSettings>({
  syncEnabled: false,
  lookbackDays: 30,
  google: {
    enabled: false,
    customerId: '',
    loginCustomerId: '',
    apiVersion: 'v23',
    developerTokenSecretName: 'GOOGLE_ADS_DEVELOPER_TOKEN',
    clientIdSecretName: 'GOOGLE_ADS_CLIENT_ID',
    clientSecretSecretName: 'GOOGLE_ADS_CLIENT_SECRET',
    refreshTokenSecretName: 'GOOGLE_ADS_REFRESH_TOKEN'
  },
  meta: {
    enabled: false,
    adAccountId: '',
    apiVersion: 'v25.0',
    accessTokenSecretName: 'META_MARKETING_ACCESS_TOKEN',
    conversionActionTypes: ['lead', 'onsite_conversion.lead_grouped', 'purchase']
  },
  lastSyncAt: null,
  lastSyncStatus: null
})

const conversionActionsInput = ref(form.meta.conversionActionTypes.join(', '))

const { pending, refresh } = await useAsyncData('admin:analytics:integrations:settings', async () => {
  const res = await $fetch<{ settings: AdsIntegrationSettings }>('/api/admin/analytics/integrations/settings')
  const settings = res.settings

  form.syncEnabled = Boolean(settings.syncEnabled)
  form.lookbackDays = Number(settings.lookbackDays ?? 30)
  form.google.enabled = Boolean(settings.google.enabled)
  form.google.customerId = String(settings.google.customerId ?? '')
  form.google.loginCustomerId = String(settings.google.loginCustomerId ?? '')
  form.google.apiVersion = String(settings.google.apiVersion ?? 'v23')
  form.google.developerTokenSecretName = String(settings.google.developerTokenSecretName ?? 'GOOGLE_ADS_DEVELOPER_TOKEN')
  form.google.clientIdSecretName = String(settings.google.clientIdSecretName ?? 'GOOGLE_ADS_CLIENT_ID')
  form.google.clientSecretSecretName = String(settings.google.clientSecretSecretName ?? 'GOOGLE_ADS_CLIENT_SECRET')
  form.google.refreshTokenSecretName = String(settings.google.refreshTokenSecretName ?? 'GOOGLE_ADS_REFRESH_TOKEN')
  form.meta.enabled = Boolean(settings.meta.enabled)
  form.meta.adAccountId = String(settings.meta.adAccountId ?? '')
  form.meta.apiVersion = String(settings.meta.apiVersion ?? 'v25.0')
  form.meta.accessTokenSecretName = String(settings.meta.accessTokenSecretName ?? 'META_MARKETING_ACCESS_TOKEN')
  form.meta.conversionActionTypes = Array.isArray(settings.meta.conversionActionTypes)
    ? settings.meta.conversionActionTypes.filter(item => typeof item === 'string' && item.trim().length > 0)
    : []
  form.lastSyncAt = settings.lastSyncAt ?? null
  form.lastSyncStatus = settings.lastSyncStatus ?? null
  conversionActionsInput.value = form.meta.conversionActionTypes.join(', ')

  return res
})

onMounted(() => {
  void refresh()
})

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function formatDateTime(value: string | null) {
  if (!value) return 'Never'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

const lastSyncProviders = computed(() => {
  const raw = form.lastSyncStatus
  if (!raw || typeof raw !== 'object') return [] as ProviderSummary[]
  const providers = (raw as { providers?: unknown }).providers
  if (!Array.isArray(providers)) return [] as ProviderSummary[]
  return providers.filter(item => item && typeof item === 'object') as ProviderSummary[]
})

const lastSyncSummary = computed(() => {
  const raw = form.lastSyncStatus
  if (!raw || typeof raw !== 'object') return 'No sync has run yet.'
  const status = raw as {
    ok?: boolean
    sync_enabled?: boolean
    totals?: {
      fetched_rows?: number
      upserted_rows?: number
    }
    dry_run?: boolean
  }
  const fetched = Number(status.totals?.fetched_rows ?? 0)
  const upserted = Number(status.totals?.upserted_rows ?? 0)
  if (!status.sync_enabled) return 'Global ads sync is disabled.'
  if (status.ok === false) return `Last sync completed with errors (${fetched} fetched / ${upserted} written).`
  if (status.dry_run) return `Last run was dry-run (${fetched} fetched / ${upserted} estimated writes).`
  return `Fetched ${fetched} rows, wrote ${upserted} rows.`
})

async function saveSettings() {
  saving.value = true
  try {
    const conversionActionTypes = conversionActionsInput.value
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)

    await $fetch('/api/admin/analytics/integrations/settings.upsert', {
      method: 'POST',
      body: {
        syncEnabled: form.syncEnabled,
        lookbackDays: form.lookbackDays,
        google: {
          enabled: form.google.enabled,
          customerId: form.google.customerId,
          loginCustomerId: form.google.loginCustomerId,
          apiVersion: form.google.apiVersion,
          developerTokenSecretName: form.google.developerTokenSecretName,
          clientIdSecretName: form.google.clientIdSecretName,
          clientSecretSecretName: form.google.clientSecretSecretName,
          refreshTokenSecretName: form.google.refreshTokenSecretName
        },
        meta: {
          enabled: form.meta.enabled,
          adAccountId: form.meta.adAccountId,
          apiVersion: form.meta.apiVersion,
          accessTokenSecretName: form.meta.accessTokenSecretName,
          conversionActionTypes
        }
      }
    })

    toast.add({
      title: 'Analytics integrations saved',
      color: 'success'
    })

    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save analytics integrations',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function syncNow(dryRun = false) {
  syncing.value = true
  try {
    const res = await $fetch<SyncResponse>('/api/admin/analytics/integrations/sync', {
      method: 'POST',
      body: { dryRun }
    })

    const fetchedRows = Number(res.summary?.totals?.fetchedRows ?? 0)
    const upsertedRows = Number(res.summary?.totals?.upsertedRows ?? 0)

    toast.add({
      title: dryRun ? 'Ads sync dry-run completed' : 'Ads sync completed',
      description: `${fetchedRows} fetched, ${upsertedRows} ${dryRun ? 'estimated writes' : 'written'} in ${(res.durationMs / 1000).toFixed(1)}s`,
      color: 'success'
    })

    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: dryRun ? 'Ads sync dry-run failed' : 'Ads sync failed',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <UDashboardPanel
    id="admin-analytics-integrations"
    class="min-h-0 flex-1 admin-ops-panel"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        title="Analytics Integrations"
        class="admin-ops-navbar"
        :ui="{ root: 'border-b-0', right: 'gap-2' }"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <AnalyticsRunButton
            size="sm"
            @completed="() => refresh()"
          />
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
      <AdminOpsShell>
        <div class="space-y-4">
          <AnalyticsSubnav />

          <UAlert
            color="info"
            variant="soft"
            icon="i-lucide-megaphone"
            title="Meta Marketing API includes Instagram placements"
            description="Use your Meta Ads account credentials. Campaign performance reflects Instagram placements served through Meta."
          />

          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-shield"
            title="Store secret values in Supabase secrets"
            description="These settings store secret names only. Set the actual token values in your secure secrets store."
          />

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="font-medium">
                Sync controls
              </div>
            </template>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Enable ads sync">
                <USwitch v-model="form.syncEnabled" />
              </UFormField>
              <UFormField label="Lookback days">
                <UInput
                  v-model.number="form.lookbackDays"
                  type="number"
                  min="1"
                  max="365"
                />
              </UFormField>
            </div>
          </UCard>

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="font-medium">
                Google Ads API
              </div>
            </template>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Enable Google Ads sync">
                <USwitch v-model="form.google.enabled" />
              </UFormField>
              <UFormField label="API version">
                <UInput
                  v-model="form.google.apiVersion"
                  placeholder="v23"
                />
              </UFormField>
              <UFormField label="Customer ID">
                <UInput
                  v-model="form.google.customerId"
                  placeholder="1234567890"
                />
              </UFormField>
              <UFormField label="Login customer ID (optional)">
                <UInput
                  v-model="form.google.loginCustomerId"
                  placeholder="0987654321"
                />
              </UFormField>
              <UFormField label="Developer token secret name">
                <UInput v-model="form.google.developerTokenSecretName" />
              </UFormField>
              <UFormField label="OAuth client ID secret name">
                <UInput v-model="form.google.clientIdSecretName" />
              </UFormField>
              <UFormField label="OAuth client secret name">
                <UInput v-model="form.google.clientSecretSecretName" />
              </UFormField>
              <UFormField label="OAuth refresh token secret name">
                <UInput v-model="form.google.refreshTokenSecretName" />
              </UFormField>
            </div>
          </UCard>

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="font-medium">
                Meta Marketing API (Facebook + Instagram)
              </div>
            </template>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Enable Meta sync">
                <USwitch v-model="form.meta.enabled" />
              </UFormField>
              <UFormField label="API version">
                <UInput
                  v-model="form.meta.apiVersion"
                  placeholder="v25.0"
                />
              </UFormField>
              <UFormField label="Ad account ID">
                <UInput
                  v-model="form.meta.adAccountId"
                  placeholder="123456789012345"
                />
              </UFormField>
              <UFormField label="Access token secret name">
                <UInput v-model="form.meta.accessTokenSecretName" />
              </UFormField>
              <UFormField
                label="Conversion action types"
                description="Comma-separated Meta action_type values used as conversions."
                class="md:col-span-2"
              >
                <UTextarea
                  v-model="conversionActionsInput"
                  :rows="3"
                />
              </UFormField>
            </div>
          </UCard>

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="font-medium">
                Last sync status
              </div>
            </template>

            <div class="text-sm text-dimmed">
              Last sync at: {{ formatDateTime(form.lastSyncAt) }}
            </div>
            <div class="mt-1 text-sm">
              {{ lastSyncSummary }}
            </div>

            <div class="mt-3 grid gap-2 md:grid-cols-2">
              <div
                v-for="(provider, providerIndex) in lastSyncProviders"
                :key="provider.platform || providerIndex"
                class="rounded-md border border-default p-3 text-sm"
              >
                <div class="font-medium capitalize">
                  {{ provider.platform || 'provider' }}
                </div>
                <div class="text-dimmed">
                  enabled: {{ provider.enabled ? 'yes' : 'no' }} · ok: {{ provider.ok ? 'yes' : 'no' }}
                </div>
                <div
                  v-if="provider.skippedReason"
                  class="mt-1 text-dimmed"
                >
                  {{ provider.skippedReason }}
                </div>
                <div
                  v-if="provider.error"
                  class="mt-1 text-error"
                >
                  {{ provider.error }}
                </div>
                <div class="mt-1 text-dimmed">
                  fetched: {{ Number(provider.fetchedRows ?? 0) }} · upserted: {{ Number(provider.upsertedRows ?? 0) }}
                </div>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <UButton
                :loading="saving"
                @click="saveSettings"
              >
                Save settings
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                :loading="syncing"
                @click="syncNow(true)"
              >
                Test sync (dry-run)
              </UButton>
              <UButton
                color="primary"
                variant="soft"
                :loading="syncing"
                @click="syncNow(false)"
              >
                Sync now
              </UButton>
            </div>
          </UCard>
        </div>
      </AdminOpsShell>
    </template>
  </UDashboardPanel>
</template>
