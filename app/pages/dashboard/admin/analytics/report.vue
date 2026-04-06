<script setup lang="ts">
import {
  copyAnalyticsText,
  formatAnalyticsDatetime,
  useAdminAnalyticsData
} from '~~/app/composables/admin/useAdminAnalytics'

definePageMeta({ middleware: ['admin'] })

const toast = useToast()
const { data, pending, refresh } = await useAdminAnalyticsData('report')

const weeklyReportMd = computed(() => data.value?.weeklyReportMd ?? '')
const weeklyReportJson = computed(() => data.value?.weeklyReportJson)
const generatedLabel = computed(() => formatAnalyticsDatetime(data.value?.generatedAt))
const weeklyReportJsonText = computed(() => JSON.stringify(weeklyReportJson.value ?? {}, null, 2))

function recommendationClipboardText(item: {
  campaign_name?: string
  objective?: string
  audience?: string
  cta?: string
  send_window?: string
  subject_options?: string[]
}) {
  return [
    item.campaign_name ? `Campaign: ${item.campaign_name}` : null,
    item.objective ? `Objective: ${item.objective}` : null,
    item.audience ? `Audience: ${item.audience}` : null,
    item.cta ? `CTA: ${item.cta}` : null,
    item.send_window ? `Send window: ${item.send_window}` : null,
    (item.subject_options?.length ?? 0) > 0 ? `Subjects: ${item.subject_options?.join(' | ')}` : null
  ]
    .filter(Boolean)
    .join('\n')
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
    id="admin-analytics-report"
    class="min-h-0 flex-1 admin-ops-panel"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        title="Analytics • Weekly Report"
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
            icon="i-lucide-file-chart-line"
            :description="`Generated: ${generatedLabel}`"
          />

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">
                  Weekly report markdown
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-copy"
                  @click="() => copyValue(weeklyReportMd || '', 'Weekly report markdown')"
                >
                  Copy
                </UButton>
              </div>
            </template>

            <pre
              class="analytics-report-block analytics-report-block--click-copy"
              role="button"
              tabindex="0"
              title="Click to copy markdown"
              @click="() => copyValue(weeklyReportMd || '', 'Weekly report markdown')"
              @keydown.enter.prevent="() => copyValue(weeklyReportMd || '', 'Weekly report markdown')"
              @keydown.space.prevent="() => copyValue(weeklyReportMd || '', 'Weekly report markdown')"
            >{{ weeklyReportMd || 'Weekly report markdown has not been generated yet.' }}</pre>
          </UCard>

          <div class="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Recommended next actions
                </div>
              </template>

              <ol
                v-if="(weeklyReportJson?.recommended_next_actions?.length ?? 0) > 0"
                class="list-decimal pl-5 text-sm space-y-2"
              >
                <li
                  v-for="(action, idx) in (weeklyReportJson?.recommended_next_actions ?? [])"
                  :key="`action-${idx}`"
                  class="analytics-copy-row"
                  role="button"
                  tabindex="0"
                  :title="`Click to copy action ${idx + 1}`"
                  @click="() => copyValue(action, `Action ${idx + 1}`)"
                  @keydown.enter.prevent="() => copyValue(action, `Action ${idx + 1}`)"
                  @keydown.space.prevent="() => copyValue(action, `Action ${idx + 1}`)"
                >
                  <span>{{ action }}</span>
                  <UIcon
                    name="i-lucide-copy"
                    class="size-3.5 text-dimmed"
                  />
                </li>
              </ol>
              <div
                v-else
                class="text-sm text-dimmed"
              >
                No recommended actions found in weekly-report.json.
              </div>
            </UCard>

            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Email recommendations
                </div>
              </template>

              <div
                v-if="(weeklyReportJson?.email_recommendations?.length ?? 0) === 0"
                class="text-sm text-dimmed"
              >
                No email recommendations generated.
              </div>

              <div
                v-else
                class="space-y-2 text-sm"
              >
                <div
                  v-for="(item, idx) in (weeklyReportJson?.email_recommendations ?? [])"
                  :key="`rec-${idx}`"
                  class="rounded-md border border-default p-2 analytics-copy-row"
                  role="button"
                  tabindex="0"
                  :title="`Click to copy recommendation ${idx + 1}`"
                  @click="() => copyValue(recommendationClipboardText(item), `Recommendation ${idx + 1}`)"
                  @keydown.enter.prevent="() => copyValue(recommendationClipboardText(item), `Recommendation ${idx + 1}`)"
                  @keydown.space.prevent="() => copyValue(recommendationClipboardText(item), `Recommendation ${idx + 1}`)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="font-medium">
                      {{ item.campaign_name }}
                    </div>
                    <UIcon
                      name="i-lucide-copy"
                      class="size-3.5 text-dimmed shrink-0"
                    />
                  </div>
                  <div class="text-xs text-dimmed mt-1">
                    {{ item.objective }}
                  </div>
                </div>
              </div>

              <UButton
                class="mt-3"
                icon="i-lucide-megaphone"
                to="/dashboard/admin/email-campaigns"
                size="sm"
              >
                Open Email Campaigns
              </UButton>
            </UCard>
          </div>

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">
                  Raw weekly-report.json
                </div>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-copy"
                  @click="() => copyValue(weeklyReportJsonText, 'Weekly report JSON')"
                >
                  Copy
                </UButton>
              </div>
            </template>
            <pre
              class="analytics-report-block analytics-report-block--click-copy"
              role="button"
              tabindex="0"
              title="Click to copy JSON"
              @click="() => copyValue(weeklyReportJsonText, 'Weekly report JSON')"
              @keydown.enter.prevent="() => copyValue(weeklyReportJsonText, 'Weekly report JSON')"
              @keydown.space.prevent="() => copyValue(weeklyReportJsonText, 'Weekly report JSON')"
            >{{ weeklyReportJsonText }}</pre>
          </UCard>
        </div>
      </AdminOpsShell>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.analytics-report-block {
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

.analytics-report-block--click-copy {
  cursor: copy;
}

.analytics-copy-row {
  cursor: copy;
}
</style>
