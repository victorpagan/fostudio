<script setup lang="ts">
import {
  copyAnalyticsText,
  formatAnalyticsCurrency,
  formatAnalyticsDatetime,
  formatAnalyticsNumber,
  useAdminAnalyticsData
} from '~~/app/composables/admin/useAdminAnalytics'

definePageMeta({ middleware: ['admin'] })

const toast = useToast()
const { data, pending, refresh } = await useAdminAnalyticsData('trends')

const trends = computed(() => data.value?.trends)
const generatedLabel = computed(() => formatAnalyticsDatetime(data.value?.generatedAt))
const trendsJsonText = computed(() => JSON.stringify(trends.value ?? {}, null, 2))

function barHeight(points: Array<{ value: number }>, value: number) {
  const max = Math.max(1, ...points.map(point => point.value))
  return `${Math.max(6, Math.round((value / max) * 100))}%`
}

const revenuePoints = computed(() =>
  (trends.value?.revenue_by_week ?? []).map(point => ({
    label: point.week,
    value: Number(point.value ?? 0)
  }))
)

const memberPoints = computed(() =>
  (trends.value?.members_by_week ?? []).map(point => ({
    label: point.week,
    value: Number(point.active ?? 0)
  }))
)

const utilizationPoints = computed(() =>
  (trends.value?.utilization_by_week ?? []).map(point => ({
    label: point.week,
    value: Number(point.value ?? 0)
  }))
)

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
    id="admin-analytics-trends"
    class="min-h-0 flex-1 admin-ops-panel"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        title="Analytics • Trends"
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
            icon="i-lucide-chart-no-axes-combined"
            :description="`Generated: ${generatedLabel}`"
          />

          <div class="grid gap-4 xl:grid-cols-3">
            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Revenue by week
                </div>
              </template>
              <div class="trend-chart-shell">
                <div
                  v-for="point in revenuePoints"
                  :key="`revenue-${point.label}`"
                  class="trend-chart-col"
                >
                  <div
                    class="trend-chart-bar"
                    :style="{ height: barHeight(revenuePoints, point.value) }"
                  />
                </div>
              </div>
              <div class="mt-2 space-y-1 text-xs text-dimmed">
                <div
                  v-for="point in revenuePoints.slice(-4)"
                  :key="`revenue-l-${point.label}`"
                  class="flex cursor-copy items-center justify-between rounded-md border border-default/60 px-2 py-1"
                  role="button"
                  tabindex="0"
                  :title="`Click to copy ${point.label} revenue`"
                  @click="() => copyValue(`${point.label}: ${formatAnalyticsCurrency(point.value)}`, `${point.label} revenue`)"
                  @keydown.enter.prevent="() => copyValue(`${point.label}: ${formatAnalyticsCurrency(point.value)}`, `${point.label} revenue`)"
                  @keydown.space.prevent="() => copyValue(`${point.label}: ${formatAnalyticsCurrency(point.value)}`, `${point.label} revenue`)"
                >
                  <span>{{ point.label }}</span>
                  <span>{{ formatAnalyticsCurrency(point.value) }}</span>
                </div>
              </div>
            </UCard>

            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Members by week
                </div>
              </template>
              <div class="trend-chart-shell">
                <div
                  v-for="point in memberPoints"
                  :key="`members-${point.label}`"
                  class="trend-chart-col"
                >
                  <div
                    class="trend-chart-bar"
                    :style="{ height: barHeight(memberPoints, point.value) }"
                  />
                </div>
              </div>
              <div class="mt-2 space-y-1 text-xs text-dimmed">
                <div
                  v-for="point in memberPoints.slice(-4)"
                  :key="`members-l-${point.label}`"
                  class="flex cursor-copy items-center justify-between rounded-md border border-default/60 px-2 py-1"
                  role="button"
                  tabindex="0"
                  :title="`Click to copy ${point.label} active members`"
                  @click="() => copyValue(`${point.label}: ${formatAnalyticsNumber(point.value)} active members`, `${point.label} members`)"
                  @keydown.enter.prevent="() => copyValue(`${point.label}: ${formatAnalyticsNumber(point.value)} active members`, `${point.label} members`)"
                  @keydown.space.prevent="() => copyValue(`${point.label}: ${formatAnalyticsNumber(point.value)} active members`, `${point.label} members`)"
                >
                  <span>{{ point.label }}</span>
                  <span>{{ formatAnalyticsNumber(point.value) }}</span>
                </div>
              </div>
            </UCard>

            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Utilization by week
                </div>
              </template>
              <div class="trend-chart-shell">
                <div
                  v-for="point in utilizationPoints"
                  :key="`util-${point.label}`"
                  class="trend-chart-col"
                >
                  <div
                    class="trend-chart-bar"
                    :style="{ height: barHeight(utilizationPoints, point.value) }"
                  />
                </div>
              </div>
              <div class="mt-2 space-y-1 text-xs text-dimmed">
                <div
                  v-for="point in utilizationPoints.slice(-4)"
                  :key="`util-l-${point.label}`"
                  class="flex cursor-copy items-center justify-between rounded-md border border-default/60 px-2 py-1"
                  role="button"
                  tabindex="0"
                  :title="`Click to copy ${point.label} utilization`"
                  @click="() => copyValue(`${point.label}: ${(point.value * 100).toFixed(1)}%`, `${point.label} utilization`)"
                  @keydown.enter.prevent="() => copyValue(`${point.label}: ${(point.value * 100).toFixed(1)}%`, `${point.label} utilization`)"
                  @keydown.space.prevent="() => copyValue(`${point.label}: ${(point.value * 100).toFixed(1)}%`, `${point.label} utilization`)"
                >
                  <span>{{ point.label }}</span>
                  <span>{{ (point.value * 100).toFixed(1) }}%</span>
                </div>
              </div>
            </UCard>
          </div>

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">
                  Raw trends.json
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-copy"
                  @click="() => copyValue(trendsJsonText, 'Trends JSON')"
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
              @click="() => copyValue(trendsJsonText, 'Trends JSON')"
              @keydown.enter.prevent="() => copyValue(trendsJsonText, 'Trends JSON')"
              @keydown.space.prevent="() => copyValue(trendsJsonText, 'Trends JSON')"
            >{{ trendsJsonText }}</pre>
          </UCard>
        </div>
      </AdminOpsShell>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.trend-chart-shell {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0.22rem;
  align-items: end;
  min-height: 7rem;
  border: 1px solid color-mix(in srgb, var(--ui-border) 85%, transparent 15%);
  border-radius: 0.6rem;
  padding: 0.4rem;
}

.trend-chart-col {
  min-height: 6rem;
  display: flex;
  align-items: end;
}

.trend-chart-bar {
  width: 100%;
  border-radius: 0.25rem;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ui-primary) 85%, white 15%) 0%, color-mix(in srgb, var(--ui-primary) 30%, black 70%) 100%);
}

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
