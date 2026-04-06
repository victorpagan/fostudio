<script setup lang="ts">
import {
  copyAnalyticsText,
  formatAnalyticsDatetime,
  type AnalyticsSeverity,
  useAdminAnalyticsData
} from '~~/app/composables/admin/useAdminAnalytics'

definePageMeta({ middleware: ['admin'] })

const toast = useToast()
const { data, pending, refresh } = await useAdminAnalyticsData('alerts')

const alerts = computed(() => data.value?.alerts ?? [])
const generatedLabel = computed(() => formatAnalyticsDatetime(data.value?.generatedAt))
const alertsJsonText = computed(() => JSON.stringify(alerts.value ?? [], null, 2))

function alertColor(severity: AnalyticsSeverity) {
  if (severity === 'high') return 'error'
  if (severity === 'medium') return 'warning'
  return 'neutral'
}

async function copyValue(value: string, label: string) {
  try {
    const copied = await copyAnalyticsText(value)
    if (!copied) {
      toast.add({
        title: `Could not copy ${label.toLowerCase()}`,
        color: 'warning'
      })
      return
    }

    toast.add({
      title: `${label} copied`,
      color: 'success'
    })
  } catch {
    toast.add({
      title: `Could not copy ${label.toLowerCase()}`,
      color: 'error'
    })
  }
}
</script>

<template>
  <UDashboardPanel
    id="admin-analytics-alerts"
    class="min-h-0 flex-1 admin-ops-panel"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        title="Analytics • Alerts"
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
            color="neutral"
            variant="soft"
            icon="i-lucide-bell-ring"
            :description="`Generated: ${generatedLabel}`"
          />

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="font-medium">
                Triggered alerts
              </div>
            </template>

            <div
              v-if="alerts.length === 0"
              class="text-sm text-dimmed"
            >
              No active alerts.
            </div>

            <div
              v-else
              class="space-y-2"
            >
              <div
                v-for="(alert, idx) in alerts"
                :key="`${alert.type}-${idx}`"
                class="rounded-lg border border-default p-3 cursor-copy"
                role="button"
                tabindex="0"
                :title="`Click to copy alert: ${alert.title}`"
                @click="() => copyValue(`[${alert.severity}] ${alert.title}\n${alert.detail}`, `${alert.title} alert`)"
                @keydown.enter.prevent="() => copyValue(`[${alert.severity}] ${alert.title}\n${alert.detail}`, `${alert.title} alert`)"
                @keydown.space.prevent="() => copyValue(`[${alert.severity}] ${alert.title}\n${alert.detail}`, `${alert.title} alert`)"
              >
                <div>
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <div class="font-medium text-sm">
                        {{ alert.title }}
                      </div>
                      <div class="mt-1 text-xs text-dimmed uppercase tracking-wide">
                        {{ alert.type }}
                      </div>
                      <p class="mt-1 text-sm text-toned">
                        {{ alert.detail }}
                      </p>
                    </div>
                    <UBadge
                      :color="alertColor(alert.severity as AnalyticsSeverity)"
                      variant="soft"
                      size="xs"
                    >
                      {{ alert.severity }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </UCard>

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">
                  Raw alerts.json
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-copy"
                  @click="() => copyValue(alertsJsonText, 'Alerts JSON')"
                >
                  Copy
                </UButton>
              </div>
            </template>
            <pre
              class="analytics-json-block analytics-json-block--click-copy"
              role="button"
              tabindex="0"
              title="Click to copy JSON"
              @click="() => copyValue(alertsJsonText, 'Alerts JSON')"
              @keydown.enter.prevent="() => copyValue(alertsJsonText, 'Alerts JSON')"
              @keydown.space.prevent="() => copyValue(alertsJsonText, 'Alerts JSON')"
            >{{ alertsJsonText }}</pre>
          </UCard>
        </div>
      </AdminOpsShell>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.analytics-json-block {
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  border: 1px solid color-mix(in srgb, var(--ui-border) 85%, transparent 15%);
  border-radius: 0.6rem;
  padding: 0.9rem;
  font-size: 0.8rem;
  line-height: 1.45;
  background: color-mix(in srgb, var(--ui-bg-elevated) 80%, transparent 20%);
}

.analytics-json-block--click-copy {
  cursor: copy;
}
</style>
