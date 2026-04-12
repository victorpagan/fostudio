<script setup lang="ts">
import {
  copyAnalyticsText,
  formatAnalyticsCurrency,
  formatAnalyticsDatetime,
  formatAnalyticsHours,
  formatAnalyticsNumber,
  formatAnalyticsRatioPct,
  formatAnalyticsSignedPct,
  useAdminAnalyticsData
} from '~~/app/composables/admin/useAdminAnalytics'

definePageMeta({ middleware: ['admin'] })

const toast = useToast()
const { data, pending, refresh } = await useAdminAnalyticsData('metrics')

const metrics = computed(() => data.value?.metrics)
const generatedLabel = computed(() => formatAnalyticsDatetime(data.value?.generatedAt))
const metricsJsonText = computed(() => JSON.stringify(metrics.value ?? {}, null, 2))

const weekRows = computed(() => {
  const week = metrics.value?.week
  const ops = metrics.value?.ops
  return [
    ['Revenue total', formatAnalyticsCurrency(week?.revenue_total)],
    ['Revenue WoW', formatAnalyticsSignedPct(week?.revenue_wow_pct)],
    ['Bookings total', formatAnalyticsNumber(week?.bookings_total)],
    ['Booked hours', formatAnalyticsHours(week?.booked_hours)],
    ['Utilization rate', formatAnalyticsRatioPct(week?.utilization_rate)],
    ['Active members', formatAnalyticsNumber(week?.active_members)],
    ['New members', formatAnalyticsNumber(week?.new_members)],
    ['Canceled members', formatAnalyticsNumber(week?.canceled_members)],
    ['Net membership change', formatAnalyticsNumber(week?.net_members)],
    ['Open incidents', formatAnalyticsNumber(ops?.incidents_open_count)],
    ['High severity open incidents', formatAnalyticsNumber(ops?.incidents_high_severity_open_count)],
    ['Submitted expenses', formatAnalyticsNumber(ops?.expenses_submitted_count)],
    ['Approved unpaid expenses', formatAnalyticsNumber(ops?.expenses_approved_unpaid_count)],
    ['Paid expenses this week', formatAnalyticsCurrency(ops?.expenses_paid_total_week)]
  ]
})

const googleAdsSummary = computed(() => {
  const google = metrics.value?.ads?.google
  if (!google) return 'Google Ads: Data unavailable.'
  return `Google: ${formatAnalyticsCurrency(google.spend)} spend, ${formatAnalyticsNumber(google.conversions)} conversions, ${formatAnalyticsCurrency(google.cost_per_conversion)} CPA`
})

const metaAdsSummary = computed(() => {
  const meta = metrics.value?.ads?.meta
  if (!meta) return 'Meta Ads: Data unavailable.'
  return `Meta: ${formatAnalyticsCurrency(meta.spend)} spend, ${formatAnalyticsNumber(meta.conversions)} conversions, ${formatAnalyticsCurrency(meta.cost_per_conversion)} CPA`
})

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
    id="admin-analytics-metrics"
    class="min-h-0 flex-1 admin-ops-panel"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        title="Analytics • Metrics"
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
            icon="i-lucide-database"
            :description="`Generated: ${generatedLabel}`"
          />

          <div class="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Weekly KPI snapshot
                </div>
              </template>

              <div class="space-y-2 text-sm">
                <div
                  v-for="row in weekRows"
                  :key="String(row[0])"
                  class="flex cursor-copy items-center justify-between rounded-md border border-default px-3 py-2"
                  role="button"
                  tabindex="0"
                  :title="`Click to copy ${String(row[0])}`"
                  @click="() => copyValue(`${String(row[0])}: ${String(row[1])}`, String(row[0]))"
                  @keydown.enter.prevent="() => copyValue(`${String(row[0])}: ${String(row[1])}`, String(row[0]))"
                  @keydown.space.prevent="() => copyValue(`${String(row[0])}: ${String(row[1])}`, String(row[0]))"
                >
                  <span class="text-dimmed">{{ row[0] }}</span>
                  <span class="font-medium">{{ row[1] }}</span>
                </div>
              </div>
            </UCard>

            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Tier + ads summary
                </div>
              </template>

              <div class="space-y-3 text-sm">
                <div>
                  <div class="text-xs uppercase tracking-wide text-dimmed">
                    Tier counts
                  </div>
                  <div class="mt-2 grid grid-cols-3 gap-2">
                    <div class="rounded-md border border-default px-3 py-2">
                      Creator: {{ formatAnalyticsNumber(metrics?.tiers?.creator) }}
                    </div>
                    <div class="rounded-md border border-default px-3 py-2">
                      Pro: {{ formatAnalyticsNumber(metrics?.tiers?.pro) }}
                    </div>
                    <div class="rounded-md border border-default px-3 py-2">
                      Studio+: {{ formatAnalyticsNumber(metrics?.tiers?.studio_plus) }}
                    </div>
                  </div>
                </div>

                <div>
                  <div class="text-xs uppercase tracking-wide text-dimmed">
                    Ads
                  </div>
                  <div class="mt-2 space-y-2">
                    <div class="rounded-md border border-default px-3 py-2">
                      {{ googleAdsSummary }}
                    </div>
                    <div class="rounded-md border border-default px-3 py-2">
                      {{ metaAdsSummary }}
                    </div>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">
                  Raw metrics.json
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-copy"
                  @click="() => copyValue(metricsJsonText, 'Metrics JSON')"
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
              @click="() => copyValue(metricsJsonText, 'Metrics JSON')"
              @keydown.enter.prevent="() => copyValue(metricsJsonText, 'Metrics JSON')"
              @keydown.space.prevent="() => copyValue(metricsJsonText, 'Metrics JSON')"
            >{{ metricsJsonText }}</pre>
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
