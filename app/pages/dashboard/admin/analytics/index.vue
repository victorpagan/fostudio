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
const { data, pending, refresh } = await useAdminAnalyticsData('overview')

const metrics = computed(() => data.value?.metrics)
const trends = computed(() => data.value?.trends)
const alerts = computed(() => data.value?.alerts ?? [])
const weeklyReportJson = computed(() => data.value?.weeklyReportJson)

const summaryCards = computed(() => {
  const week = metrics.value?.week
  const ops = metrics.value?.ops
  return [
    { label: 'Revenue', value: formatAnalyticsCurrency(week?.revenue_total) },
    { label: 'Revenue WoW', value: formatAnalyticsSignedPct(week?.revenue_wow_pct) },
    { label: 'Bookings', value: formatAnalyticsNumber(week?.bookings_total) },
    { label: 'Booked hours', value: formatAnalyticsHours(week?.booked_hours) },
    { label: 'Utilization', value: formatAnalyticsRatioPct(week?.utilization_rate) },
    { label: 'Active members', value: formatAnalyticsNumber(week?.active_members) },
    { label: 'Open incidents', value: formatAnalyticsNumber(ops?.incidents_open_count) },
    { label: 'Submitted expenses', value: formatAnalyticsNumber(ops?.expenses_submitted_count) },
    { label: 'Paid expenses (week)', value: formatAnalyticsCurrency(ops?.expenses_paid_total_week) }
  ]
})

const trendQuickView = computed(() => {
  const revenue = trends.value?.revenue_by_week ?? []
  return revenue.slice(-6)
})

const freshnessLabel = computed(() => {
  if (data.value?.freshness === 'fresh') return 'Fresh'
  if (data.value?.freshness === 'stale') return 'Stale'
  return 'Missing'
})

const generatedLabel = computed(() => formatAnalyticsDatetime(data.value?.generatedAt))
const sourceLabel = computed(() => `${data.value?.storage ?? 'filesystem'}${data.value?.source ? `/${data.value.source}` : ''}`)

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
    id="admin-analytics-overview"
    class="min-h-0 flex-1 admin-ops-panel"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        title="Analytics"
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
            :color="data?.freshness === 'fresh' ? 'success' : data?.freshness === 'stale' ? 'warning' : 'error'"
            variant="soft"
            icon="i-lucide-chart-column"
            :title="`Analytics status: ${freshnessLabel}`"
            :description="`${generatedLabel} • source: ${sourceLabel}`"
          />

          <UAlert
            v-if="(data?.missingFiles?.length ?? 0) > 0"
            color="warning"
            variant="soft"
            icon="i-lucide-terminal"
            :title="`Missing output files: ${data?.missingFiles?.join(', ')}`"
            description="Run `pnpm analytics:all` from repo root to generate dashboard outputs."
          />

          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <UCard
              v-for="card in summaryCards"
              :key="card.label"
              class="admin-panel-card border-0 cursor-copy"
              role="button"
              tabindex="0"
              :title="`Click to copy ${card.label}`"
              @click="() => copyValue(`${card.label}: ${card.value}`, card.label)"
              @keydown.enter.prevent="() => copyValue(`${card.label}: ${card.value}`, card.label)"
              @keydown.space.prevent="() => copyValue(`${card.label}: ${card.value}`, card.label)"
            >
              <div class="text-xs uppercase tracking-wide text-dimmed">
                {{ card.label }}
              </div>
              <div class="mt-2 text-2xl font-semibold">
                {{ card.value }}
              </div>
            </UCard>
          </div>

          <div class="grid gap-4 xl:grid-cols-2">
            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Quick trend preview
                </div>
              </template>

              <div
                v-if="trendQuickView.length === 0"
                class="text-sm text-dimmed"
              >
                No trend data generated yet.
              </div>
              <div
                v-else
                class="space-y-2 text-sm"
              >
                <div
                  v-for="point in trendQuickView"
                  :key="`overview-trend-${point.week}`"
                  class="flex cursor-copy items-center justify-between rounded-md border border-default px-3 py-2"
                  role="button"
                  tabindex="0"
                  :title="`Click to copy ${point.week} revenue`"
                  @click="() => copyValue(`${point.week}: ${formatAnalyticsCurrency(point.value)}`, `${point.week} revenue`)"
                  @keydown.enter.prevent="() => copyValue(`${point.week}: ${formatAnalyticsCurrency(point.value)}`, `${point.week} revenue`)"
                  @keydown.space.prevent="() => copyValue(`${point.week}: ${formatAnalyticsCurrency(point.value)}`, `${point.week} revenue`)"
                >
                  <span class="text-dimmed">{{ point.week }}</span>
                  <span class="font-medium">{{ formatAnalyticsCurrency(point.value) }}</span>
                </div>
              </div>

              <UButton
                class="mt-3"
                size="sm"
                variant="soft"
                to="/dashboard/admin/analytics/trends"
              >
                Open full trends
              </UButton>
            </UCard>

            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Alerts and actions
                </div>
              </template>

              <div class="space-y-2">
                <div
                  class="rounded-md border border-default px-3 py-2 text-sm cursor-copy"
                  role="button"
                  tabindex="0"
                  title="Click to copy active alerts count"
                  @click="() => copyValue(`${alerts.length} active alerts`, 'Active alerts count')"
                  @keydown.enter.prevent="() => copyValue(`${alerts.length} active alerts`, 'Active alerts count')"
                  @keydown.space.prevent="() => copyValue(`${alerts.length} active alerts`, 'Active alerts count')"
                >
                  <strong>{{ alerts.length }}</strong> active alerts
                </div>
                <div
                  class="rounded-md border border-default px-3 py-2 text-sm cursor-copy"
                  role="button"
                  tabindex="0"
                  title="Click to copy recommended actions count"
                  @click="() => copyValue(`${weeklyReportJson?.recommended_next_actions?.length ?? 0} weekly recommended actions`, 'Recommended actions count')"
                  @keydown.enter.prevent="() => copyValue(`${weeklyReportJson?.recommended_next_actions?.length ?? 0} weekly recommended actions`, 'Recommended actions count')"
                  @keydown.space.prevent="() => copyValue(`${weeklyReportJson?.recommended_next_actions?.length ?? 0} weekly recommended actions`, 'Recommended actions count')"
                >
                  <strong>{{ weeklyReportJson?.recommended_next_actions?.length ?? 0 }}</strong> weekly recommended actions
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <UButton
                  size="sm"
                  variant="soft"
                  to="/dashboard/admin/analytics/alerts"
                >
                  Open alerts
                </UButton>
                <UButton
                  size="sm"
                  variant="soft"
                  to="/dashboard/admin/analytics/report"
                >
                  Open weekly report
                </UButton>
                <UButton
                  size="sm"
                  variant="soft"
                  to="/dashboard/admin/analytics/integrations"
                >
                  Open integrations
                </UButton>
              </div>
            </UCard>
          </div>
        </div>
      </AdminOpsShell>
    </template>
  </UDashboardPanel>
</template>
