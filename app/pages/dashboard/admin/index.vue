<script setup lang="ts">
import { DateTime } from 'luxon'

definePageMeta({ middleware: ['admin'] })

type PeriodMode = 'week' | 'month' | '90d' | 'year'
const OPS_TIMEZONE = 'America/Los_Angeles'

type OpsResponse = {
  summary?: {
    dueGrantCount?: number
    scheduledGrantCount?: number
    membershipsNeedingAttention?: number
    guestBookings?: number
    activeBookingsInRange?: number
    membershipsMissingFutureSchedule?: number
    pendingLockJobs?: number
    deadLockJobs?: number
    openLockIncidents?: number
    totalRevenueCents?: number
    membershipRevenueCents?: number
    creditTopupRevenueCents?: number
    holdTopupRevenueCents?: number
    totalOrders?: number
  }
  range?: {
    start?: string
    end?: string
    bucket?: 'day' | 'week' | 'month'
  }
  revenueSeries?: Array<{
    key: string
    label: string
    membershipCents: number
    creditTopupCents: number
    holdTopupCents: number
    totalCents: number
    orders: number
  }>
  topMembers?: Array<{
    userId: string
    name: string | null
    email: string | null
    bookings: number
    creditsBurned: number
    revenueCents: number
    lastBookingAt: string | null
  }>
  criticalIssues?: Array<{
    id: string
    title: string
    severity: 'neutral' | 'warning' | 'error' | 'success'
    count: number
    to: string
    description: string
  }>
  campaignReminders?: Array<{
    id: string
    title: string
    status: string
    dueLabel: string
    description: string
    to: string
  }>
  accessStatus?: {
    pendingJobs: number
    deadJobs: number
    openIncidents: number
    permanentCodesActive: number
    permanentCodesSyncErrors: number
    permanentCodesDisarmAbodeOutsideLabHours: boolean
  }
}

const periodMode = ref<PeriodMode>('month')
const periodAnchorIso = ref(DateTime.now().setZone(OPS_TIMEZONE).toISODate() ?? DateTime.now().toISODate() ?? '')
const nowInZone = computed(() => DateTime.now().setZone(OPS_TIMEZONE).endOf('day'))

function anchorDate() {
  const parsed = DateTime.fromISO(periodAnchorIso.value, { zone: OPS_TIMEZONE })
  if (parsed.isValid) return parsed.endOf('day')
  return DateTime.now().setZone(OPS_TIMEZONE).endOf('day')
}

function clampToNow(date: DateTime) {
  return date > nowInZone.value ? nowInZone.value : date
}

const activeRange = computed(() => {
  const anchor = clampToNow(anchorDate())
  if (periodMode.value === 'week') {
    const start = anchor.startOf('week')
    const end = clampToNow(start.endOf('week'))
    return { start, end, bucket: 'day' as const }
  }
  if (periodMode.value === 'year') {
    const start = anchor.startOf('year')
    const end = clampToNow(start.endOf('year'))
    return { start, end, bucket: 'month' as const }
  }
  if (periodMode.value === '90d') {
    const end = anchor.endOf('day')
    const start = end.minus({ days: 89 }).startOf('day')
    return { start, end, bucket: 'week' as const }
  }

  const start = anchor.startOf('month')
  const end = clampToNow(start.endOf('month'))
  return { start, end, bucket: 'day' as const }
})

const rangeLabel = computed(() => {
  const start = activeRange.value.start.setZone(OPS_TIMEZONE)
  const end = activeRange.value.end.setZone(OPS_TIMEZONE)
  if (periodMode.value === 'year') return start.toFormat('yyyy')
  if (periodMode.value === 'month') return start.toFormat('LLLL yyyy')
  if (periodMode.value === 'week') return `${start.toFormat('LLL d')} - ${end.toFormat('LLL d, yyyy')}`
  return `${start.toFormat('LLL d')} - ${end.toFormat('LLL d, yyyy')}`
})

function stepPeriod(direction: -1 | 1) {
  const anchor = anchorDate()
  let next = anchor
  if (periodMode.value === 'week') next = anchor.plus({ weeks: direction })
  else if (periodMode.value === 'year') next = anchor.plus({ years: direction })
  else if (periodMode.value === '90d') next = anchor.plus({ days: 90 * direction })
  else next = anchor.plus({ months: direction })

  next = clampToNow(next)
  periodAnchorIso.value = next.toISODate() ?? periodAnchorIso.value
}

const canStepForward = computed(() => {
  const anchor = anchorDate()
  if (anchor >= nowInZone.value.startOf('day')) return false
  if (periodMode.value === 'week') return anchor.plus({ weeks: 1 }).startOf('week') <= nowInZone.value
  if (periodMode.value === 'year') return anchor.plus({ years: 1 }).startOf('year') <= nowInZone.value
  if (periodMode.value === '90d') return anchor.plus({ days: 90 }) <= nowInZone.value
  return anchor.plus({ months: 1 }).startOf('month') <= nowInZone.value
})

const periodButtons: Array<{ label: string, value: PeriodMode }> = [
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: '90 Days', value: '90d' },
  { label: 'Year', value: 'year' }
]

const queryParams = computed(() => ({
  start: activeRange.value.start.toUTC().toISO(),
  end: activeRange.value.end.toUTC().toISO(),
  bucket: activeRange.value.bucket
}))

const { data, pending, refresh } = await useAsyncData<OpsResponse>('admin:overview:ops:v2', async () => {
  return await $fetch('/api/admin/ops', { query: queryParams.value })
}, { watch: [queryParams] })

const opsScrollRef = ref<HTMLElement | null>(null)
const opsCanScrollUp = ref(false)
const opsCanScrollDown = ref(false)

function updateOpsScrollState() {
  const host = opsScrollRef.value
  if (!host) {
    opsCanScrollUp.value = false
    opsCanScrollDown.value = false
    return
  }

  const top = host.scrollTop
  const maxTop = Math.max(0, host.scrollHeight - host.clientHeight)
  opsCanScrollUp.value = top > 6
  opsCanScrollDown.value = top < (maxTop - 6)
}

function handleOpsScroll() {
  updateOpsScrollState()
}

onMounted(async () => {
  periodAnchorIso.value = DateTime.now().setZone(OPS_TIMEZONE).toISODate() ?? periodAnchorIso.value
  await refresh()
  await nextTick()
  updateOpsScrollState()

  const host = opsScrollRef.value
  host?.addEventListener('scroll', handleOpsScroll, { passive: true })
  window.addEventListener('resize', updateOpsScrollState)
})

onBeforeUnmount(() => {
  const host = opsScrollRef.value
  host?.removeEventListener('scroll', handleOpsScroll)
  window.removeEventListener('resize', updateOpsScrollState)
})

watch([data, pending], async () => {
  await nextTick()
  updateOpsScrollState()
}, { deep: true })

watch(periodMode, (next, prev) => {
  if (next === 'month' && prev !== 'month') {
    periodAnchorIso.value = DateTime.now().setZone(OPS_TIMEZONE).toISODate() ?? periodAnchorIso.value
  }
})

const revenueSeries = computed(() => data.value?.revenueSeries ?? [])
const maxRevenueCents = computed(() =>
  Math.max(1, ...revenueSeries.value.map(item => Number(item.totalCents ?? 0)))
)

const revenueMixTotal = computed(() => {
  const summary = data.value?.summary
  return Number(summary?.membershipRevenueCents ?? 0)
    + Number(summary?.creditTopupRevenueCents ?? 0)
    + Number(summary?.holdTopupRevenueCents ?? 0)
})

const revenueMixPercent = computed(() => {
  const summary = data.value?.summary
  const total = Math.max(1, revenueMixTotal.value)
  const membership = (Number(summary?.membershipRevenueCents ?? 0) / total) * 100
  const credits = (Number(summary?.creditTopupRevenueCents ?? 0) / total) * 100
  const holds = (Number(summary?.holdTopupRevenueCents ?? 0) / total) * 100
  return { membership, credits, holds }
})

const revenueMixStyle = computed(() => {
  const segments = revenueMixPercent.value
  const creditsEnd = segments.membership + segments.credits
  return {
    background: `conic-gradient(
      color-mix(in srgb, var(--gruv-accent) 90%, white 10%) 0% ${segments.membership}%,
      color-mix(in srgb, var(--gruv-aqua) 85%, white 15%) ${segments.membership}% ${creditsEnd}%,
      color-mix(in srgb, var(--gruv-olive) 85%, white 15%) ${creditsEnd}% 100%
    )`
  }
})

const topMembers = computed(() => data.value?.topMembers ?? [])
const usageLeaders = computed(() => (
  topMembers.value
    .filter(member => Number(member.revenueCents ?? 0) > 0)
    .slice(0, 4)
))
const campaignReminders = computed(() => data.value?.campaignReminders ?? [])
const criticalDetailsOpen = ref(false)

const criticalPressureTotal = computed(() =>
  Number(data.value?.summary?.openLockIncidents ?? 0)
  + Number(data.value?.summary?.deadLockJobs ?? 0)
  + Number(data.value?.summary?.dueGrantCount ?? 0)
)

const criticalPressureSources = computed(() => ([
  {
    id: 'lock-incidents',
    title: 'Open lock incidents',
    count: Number(data.value?.summary?.openLockIncidents ?? 0),
    description: 'Incidents where lock actions or state checks need manual follow-up.',
    to: '/dashboard/admin/tools'
  },
  {
    id: 'dead-jobs',
    title: 'Dead lock jobs',
    count: Number(data.value?.summary?.deadLockJobs ?? 0),
    description: 'Background lock jobs that exhausted retries and require retry/remediation.',
    to: '/dashboard/admin/tools'
  },
  {
    id: 'due-grants',
    title: 'Credit grants due',
    count: Number(data.value?.summary?.dueGrantCount ?? 0),
    description: 'Scheduled credit grants now due for processing.',
    to: '/dashboard/admin/tools'
  },
  {
    id: 'missing-future-schedules',
    title: 'Missing future grant schedules',
    count: Number(data.value?.summary?.membershipsMissingFutureSchedule ?? 0),
    description: 'Extended memberships missing future grant rows.',
    to: '/dashboard/admin/tools'
  }
]))

function formatMoney(cents: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    .format((Number(cents ?? 0) || 0) / 100)
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = DateTime.fromISO(value, { zone: 'utc' })
  if (!parsed.isValid) return value
  return parsed.setZone(OPS_TIMEZONE).toFormat('LLL d')
}

function usageLeaderTo(userId: string) {
  return {
    path: '/dashboard/admin/members',
    query: { userId }
  }
}

function barSegmentHeight(value: number) {
  const max = maxRevenueCents.value
  return `${Math.max(2, Math.round((Math.max(0, value) / max) * 100))}%`
}

const accessStatus = computed(() => data.value?.accessStatus ?? {
  pendingJobs: 0,
  deadJobs: 0,
  openIncidents: 0,
  permanentCodesActive: 0,
  permanentCodesSyncErrors: 0,
  permanentCodesDisarmAbodeOutsideLabHours: false
})
</script>

<template>
  <UDashboardPanel
    id="admin-overview"
    class="min-h-0 flex-1 admin-ops-panel"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        title="Ops Overview"
        class="admin-ops-navbar"
        :ui="{ root: 'border-b-0', right: 'gap-2' }"
      >
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
      <div
        ref="opsScrollRef"
        class="admin-ops-shell h-full overflow-y-auto p-4 sm:p-5 md:p-6 space-y-4 md:space-y-5"
        :class="{
          'admin-ops-shell--scrolled-top': opsCanScrollUp,
          'admin-ops-shell--scrolled-bottom': opsCanScrollDown
        }"
      >
        <section class="admin-ops-hero rounded-2xl p-4 sm:p-5 md:p-6">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.22em] text-dimmed">
                Revenue + Critical Operations
              </p>
              <p class="max-w-3xl text-sm text-toned">
                Selected range drives all totals, trend bars, and pressure signals.
              </p>
            </div>
            <div class="admin-period-toolbar flex items-center gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-chevron-left"
                @click="stepPeriod(-1)"
              />
              <div class="px-1 py-2 text-xs text-toned min-w-48 text-center">
                {{ rangeLabel }}
              </div>
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-chevron-right"
                :disabled="!canStepForward"
                @click="stepPeriod(1)"
              />
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            <UButton
              v-for="mode in periodButtons"
              :key="mode.value"
              size="xs"
              :color="periodMode === mode.value ? 'primary' : 'neutral'"
              :variant="periodMode === mode.value ? 'solid' : 'ghost'"
              @click="periodMode = mode.value"
            >
              {{ mode.label }}
            </UButton>
          </div>
        </section>

        <section class="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          <UCard class="admin-kpi-card admin-kpi-card--accent border-0">
            <div class="text-[11px] uppercase tracking-[0.2em] text-inverted/85">
              Revenue
            </div>
            <div class="mt-2 text-3xl font-[var(--font-display)] font-light text-inverted">
              {{ formatMoney(data?.summary?.totalRevenueCents) }}
            </div>
            <p class="mt-2 text-xs text-inverted/80">
              {{ data?.summary?.totalOrders ?? 0 }} paid transactions in range
            </p>
          </UCard>

          <UCard class="admin-kpi-card border-0">
            <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
              Critical pressure
            </div>
            <div class="mt-2 text-3xl font-[var(--font-display)] font-light">
              {{ criticalPressureTotal }}
            </div>
            <p class="mt-2 text-xs text-dimmed">
              Incidents + dead jobs + due grants
            </p>
            <UButton
              class="mt-3 w-fit"
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-panel-right-open"
              @click="criticalDetailsOpen = true"
            >
              See sources
            </UButton>
          </UCard>

          <UCard class="admin-kpi-card border-0">
            <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
              Campaign reminders
            </div>
            <div class="mt-2 text-3xl font-[var(--font-display)] font-light">
              {{ campaignReminders.length }}
            </div>
            <p class="mt-2 text-xs text-dimmed">
              {{ campaignReminders[0]?.dueLabel ?? 'No reminders queued' }}
            </p>
            <UButton
              class="mt-3 w-fit"
              size="xs"
              color="neutral"
              variant="ghost"
              to="/dashboard/admin/email-campaigns"
            >
              Open campaigns
            </UButton>
          </UCard>
        </section>

        <section class="grid gap-3 sm:gap-4 xl:grid-cols-[1.6fr_1fr]">
          <UCard class="admin-panel-card border-0">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                  Sales trend
                </div>
                <h2 class="mt-1 text-xl font-[var(--font-display)] font-light">
                  Revenue by {{ data?.range?.bucket === 'month' ? 'month' : data?.range?.bucket === 'week' ? 'week' : 'day' }}
                </h2>
              </div>
              <UBadge
                size="sm"
                color="primary"
                variant="soft"
              >
                {{ formatMoney(data?.summary?.totalRevenueCents) }}
              </UBadge>
            </div>

            <div class="mt-4">
              <div class="admin-revenue-chart">
                <div
                  v-for="point in revenueSeries"
                  :key="point.key"
                  class="admin-revenue-chart-col"
                >
                  <div class="admin-revenue-bar-shell">
                    <div class="admin-revenue-bar-stack">
                      <div
                        class="admin-revenue-segment admin-revenue-segment--holds"
                        :style="{ height: barSegmentHeight(point.holdTopupCents) }"
                      />
                      <div
                        class="admin-revenue-segment admin-revenue-segment--topups"
                        :style="{ height: barSegmentHeight(point.creditTopupCents) }"
                      />
                      <div
                        class="admin-revenue-segment admin-revenue-segment--membership"
                        :style="{ height: barSegmentHeight(point.membershipCents) }"
                      />
                    </div>
                  </div>
                  <div class="admin-revenue-label">
                    {{ point.label }}
                  </div>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span class="admin-legend-pill">
                  <span class="admin-legend-dot admin-legend-dot--membership" /> Membership
                </span>
                <span class="admin-legend-pill">
                  <span class="admin-legend-dot admin-legend-dot--topups" /> Credits
                </span>
                <span class="admin-legend-pill">
                  <span class="admin-legend-dot admin-legend-dot--holds" /> Holds
                </span>
              </div>
            </div>
          </UCard>

          <UCard class="admin-panel-card admin-panel-card--transparent border-0">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                  Usage leaders
                </div>
                <h2 class="mt-1 text-xl font-[var(--font-display)] font-light">
                  Top 4 in {{ rangeLabel }}
                </h2>
              </div>
            </div>

            <p class="mt-2 text-xs text-dimmed">
              Derived from non-canceled member bookings plus processed membership/top-up payments in {{ rangeLabel }}.
            </p>

            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <NuxtLink
                v-for="member in usageLeaders"
                :key="member.userId"
                class="admin-leader-tile"
                :to="usageLeaderTo(member.userId)"
              >
                <div class="min-w-0 space-y-2">
                  <div class="flex items-center gap-2">
                    <div class="admin-leader-avatar">
                      {{ (member.name || member.email || member.userId || '?').slice(0, 1).toUpperCase() }}
                    </div>
                    <div class="min-w-0">
                      <div class="truncate text-sm font-medium text-highlighted">
                        {{ member.name || member.email || member.userId }}
                      </div>
                      <div class="truncate text-xs text-dimmed">
                        {{ member.email || member.userId }}
                      </div>
                    </div>
                  </div>
                  <div class="admin-leader-value">
                    {{ formatMoney(member.revenueCents) }}
                  </div>
                  <div class="admin-leader-metrics">
                    <span class="admin-leader-pill">{{ member.bookings }} bookings</span>
                    <span class="admin-leader-pill">{{ member.creditsBurned }} cr</span>
                    <span class="admin-leader-pill">Last {{ formatShortDate(member.lastBookingAt) }}</span>
                  </div>
                </div>
                <div class="admin-leader-arrow">
                  <UIcon
                    name="i-lucide-arrow-up-right"
                    class="size-4"
                  />
                </div>
              </NuxtLink>
              <div
                v-if="!usageLeaders.length"
                class="sm:col-span-2 text-center text-dimmed py-5 text-sm"
              >
                No member activity in selected period.
              </div>
            </div>
          </UCard>
        </section>

        <section>
          <div class="grid gap-3 sm:gap-4 md:grid-cols-2">
            <UCard class="admin-panel-card border-0">
              <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                Revenue mix
              </div>
              <p class="mt-1 text-xs text-dimmed">
                Split for {{ rangeLabel }}
              </p>
              <div class="mt-3 flex items-center gap-4">
                <div
                  class="admin-mix-ring"
                  :style="revenueMixStyle"
                />
                <div class="space-y-1.5 text-xs text-dimmed">
                  <div>Membership: <span class="text-highlighted">{{ formatMoney(data?.summary?.membershipRevenueCents) }}</span></div>
                  <div>Credit topups: <span class="text-highlighted">{{ formatMoney(data?.summary?.creditTopupRevenueCents) }}</span></div>
                  <div>Hold topups: <span class="text-highlighted">{{ formatMoney(data?.summary?.holdTopupRevenueCents) }}</span></div>
                </div>
              </div>
            </UCard>

            <UCard class="admin-panel-card border-0">
              <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                Access + door state
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div class="admin-mini-stat">
                  <span>Pending jobs</span>
                  <strong>{{ accessStatus.pendingJobs }}</strong>
                </div>
                <div class="admin-mini-stat">
                  <span>Dead jobs</span>
                  <strong>{{ accessStatus.deadJobs }}</strong>
                </div>
                <div class="admin-mini-stat">
                  <span>Open incidents</span>
                  <strong>{{ accessStatus.openIncidents }}</strong>
                </div>
                <div class="admin-mini-stat">
                  <span>Active permanent codes</span>
                  <strong>{{ accessStatus.permanentCodesActive }}</strong>
                </div>
                <div class="admin-mini-stat col-span-2">
                  <span>Abode disarm outside lab hours</span>
                  <UBadge
                    size="xs"
                    :color="accessStatus.permanentCodesDisarmAbodeOutsideLabHours ? 'success' : 'neutral'"
                    variant="soft"
                  >
                    {{ accessStatus.permanentCodesDisarmAbodeOutsideLabHours ? 'Enabled' : 'Disabled' }}
                  </UBadge>
                </div>
                <div class="admin-mini-stat col-span-2">
                  <span>Permanent sync errors</span>
                  <UBadge
                    size="xs"
                    :color="accessStatus.permanentCodesSyncErrors > 0 ? 'warning' : 'success'"
                    variant="soft"
                  >
                    {{ accessStatus.permanentCodesSyncErrors }}
                  </UBadge>
                </div>
              </div>
            </UCard>
          </div>
        </section>
      </div>

      <USlideover
        v-model:open="criticalDetailsOpen"
        side="right"
        title="Critical pressure sources"
        description="Signals that roll up into critical pressure and where to take action."
        :ui="{ content: 'max-w-xl w-full border-0 admin-critical-slideover' }"
      >
        <template #body>
          <div class="space-y-2 p-2">
            <div class="pb-1 text-sm text-toned">
              <span class="font-medium text-highlighted">{{ criticalPressureTotal }}</span> active pressure points
            </div>
            <NuxtLink
              v-for="source in criticalPressureSources"
              :key="source.id"
              :to="source.to"
              class="admin-critical-source"
              @click="criticalDetailsOpen = false"
            >
              <div class="space-y-1">
                <div class="text-sm font-medium text-highlighted">
                  {{ source.title }}
                </div>
                <p class="text-xs text-dimmed">
                  {{ source.description }}
                </p>
              </div>
              <UBadge
                size="sm"
                :color="source.count > 0 ? 'warning' : 'neutral'"
                variant="soft"
              >
                {{ source.count }}
              </UBadge>
            </NuxtLink>
          </div>
        </template>
      </USlideover>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.admin-ops-panel {
  background: #dadbdc;
  --ui-text: #1f232b;
  --ui-text-toned: #323a48;
  --ui-text-dimmed: #5f6978;
  --ui-text-highlighted: #121923;
  --ui-text-inverted: #f7f8fb;
  --ui-bg-elevated: #d3d6da;
  --ui-bg-muted: #c4c9d0;
  --ui-border: rgba(18, 24, 32, 0.18);
}

.admin-ops-navbar {
  background: color-mix(in srgb, #dadbdc 94%, #c8cdd3 6%);
}

.admin-ops-shell {
  position: relative;
  background:
    radial-gradient(900px 420px at 78% -10%, color-mix(in srgb, var(--gruv-accent) 7%, transparent), transparent 62%),
    radial-gradient(760px 420px at 12% 110%, color-mix(in srgb, var(--gruv-aqua) 7%, transparent), transparent 58%),
    #cfd1d3;
  border-radius: 1rem;
}

.admin-ops-shell > * {
  position: relative;
  z-index: 1;
}

.admin-ops-shell.admin-ops-shell--scrolled-top {
  box-shadow: inset 0 16px 24px -20px rgba(0, 0, 0, 0.82);
}

.admin-ops-shell.admin-ops-shell--scrolled-bottom {
  box-shadow: inset 0 -16px 24px -20px rgba(0, 0, 0, 0.82);
}

.admin-ops-shell.admin-ops-shell--scrolled-top.admin-ops-shell--scrolled-bottom {
  box-shadow:
    inset 0 16px 24px -20px rgba(0, 0, 0, 0.82),
    inset 0 -16px 24px -20px rgba(0, 0, 0, 0.82);
}

:global(.dark) .admin-ops-panel {
  background: #2b2b2b;
  --ui-text: #e9e9e9;
  --ui-text-toned: #d2d2d2;
  --ui-text-dimmed: #a9a9a9;
  --ui-text-highlighted: #f7f7f7;
  --ui-text-inverted: #f7f7f7;
  --ui-bg-elevated: #343434;
  --ui-bg-muted: #2f2f2f;
  --ui-border: rgba(255, 255, 255, 0.14);
}

:global(.dark) .admin-ops-navbar {
  background: color-mix(in srgb, #2b2b2b 94%, #1a1a1a 6%);
}

:global(.dark) .admin-ops-shell {
  background:
    radial-gradient(900px 420px at 78% -10%, color-mix(in srgb, var(--gruv-accent) 12%, transparent), transparent 62%),
    radial-gradient(760px 420px at 12% 110%, color-mix(in srgb, var(--gruv-aqua) 10%, transparent), transparent 58%),
    #222222;
}

.admin-ops-hero {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--gruv-accent) 15%, #2b2b2b 85%), color-mix(in srgb, #2f2f2f 80%, transparent 20%));
}

.admin-period-toolbar {
  border: 0;
}

.admin-kpi-card,
.admin-panel-card {
  background: color-mix(in srgb, #d7dade 86%, #c7ccd4 14%);
  box-shadow: none;
}

.admin-panel-card--transparent {
  background: transparent;
}

:global(.dark) .admin-kpi-card,
:global(.dark) .admin-panel-card {
  background: color-mix(in srgb, #3a3a3a 82%, transparent 18%);
}

.admin-kpi-card--accent {
  background: linear-gradient(152deg, var(--gruv-accent), var(--gruv-accent-strong));
}

.admin-revenue-chart {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(34px, 1fr));
  gap: 0.45rem;
  align-items: end;
}

.admin-revenue-chart-col {
  min-width: 0;
}

.admin-revenue-bar-shell {
  height: 11.5rem;
  border-radius: 0.62rem;
  background: color-mix(in srgb, var(--ui-bg-muted) 62%, transparent 38%);
  padding: 0.2rem;
  display: flex;
  align-items: stretch;
}

.admin-revenue-bar-stack {
  width: 100%;
  border-radius: 0.5rem;
  display: flex;
  flex-direction: column-reverse;
  overflow: hidden;
}

.admin-revenue-segment {
  width: 100%;
}

.admin-revenue-segment--membership {
  background: color-mix(in srgb, var(--gruv-accent) 90%, white 10%);
}

.admin-revenue-segment--topups {
  background: color-mix(in srgb, var(--gruv-aqua) 85%, white 15%);
}

.admin-revenue-segment--holds {
  background: color-mix(in srgb, var(--gruv-olive) 85%, white 15%);
}

.admin-revenue-label {
  margin-top: 0.35rem;
  text-align: center;
  font-size: 0.66rem;
  color: var(--ui-text-dimmed);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-legend-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-elevated) 68%, transparent 32%);
  padding: 0.22rem 0.55rem;
  color: var(--ui-text-dimmed);
}

.admin-legend-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  display: inline-block;
}

.admin-legend-dot--membership {
  background: color-mix(in srgb, var(--gruv-accent) 90%, white 10%);
}

.admin-legend-dot--topups {
  background: color-mix(in srgb, var(--gruv-aqua) 85%, white 15%);
}

.admin-legend-dot--holds {
  background: color-mix(in srgb, var(--gruv-olive) 85%, white 15%);
}

.admin-mix-ring {
  width: 5.5rem;
  height: 5.5rem;
  border-radius: 999px;
  position: relative;
  flex-shrink: 0;
}

.admin-mix-ring::after {
  content: '';
  position: absolute;
  inset: 0.88rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg) 82%, transparent 18%);
}

.admin-mini-stat {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--ui-bg-elevated) 60%, transparent 40%);
  padding: 0.5rem 0.6rem;
  color: var(--ui-text-dimmed);
}

.admin-mini-stat strong {
  color: var(--ui-text-highlighted);
  font-weight: 500;
}

.admin-leader-tile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  border-radius: 1rem;
  padding: 0.72rem;
  background: color-mix(in srgb, #d8dce2 90%, #c7ccd5 10%);
  border: 0;
}

.admin-leader-tile:hover {
  background: color-mix(in srgb, #d0d5dd 90%, #c0c6d0 10%);
}

.admin-leader-avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
  background: color-mix(in srgb, #b9c0cc 72%, transparent 28%);
}

.admin-leader-value {
  font-size: 1.52rem;
  line-height: 1;
  letter-spacing: 0.01em;
  color: color-mix(in srgb, var(--gruv-accent) 82%, #ffe7a0 18%);
}

.admin-leader-metrics {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 0.35rem;
  min-width: 0;
}

.admin-leader-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.2rem 0.52rem;
  font-size: 0.68rem;
  color: var(--ui-text-toned);
  background: color-mix(in srgb, #c2c8d1 72%, transparent 28%);
}

.admin-leader-arrow {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--ui-text-dimmed) 92%, #101828 8%);
  background: color-mix(in srgb, #bec5cf 72%, transparent 28%);
}

:global(.dark) .admin-leader-tile {
  background: color-mix(in srgb, #2f2f2f 88%, transparent 12%);
}

:global(.dark) .admin-leader-tile:hover {
  background: color-mix(in srgb, #383838 86%, transparent 14%);
}

:global(.dark) .admin-leader-avatar {
  background: color-mix(in srgb, #525252 82%, transparent 18%);
}

:global(.dark) .admin-leader-pill {
  background: color-mix(in srgb, #474747 80%, transparent 20%);
}

:global(.dark) .admin-leader-arrow {
  color: color-mix(in srgb, var(--ui-text-dimmed) 78%, white 22%);
  background: color-mix(in srgb, #444444 78%, transparent 22%);
}

.admin-issue-row,
.admin-reminder-row {
  display: block;
  border-radius: 0.72rem;
  background: color-mix(in srgb, var(--ui-bg-elevated) 58%, transparent 42%);
  padding: 0.6rem 0.72rem;
}

.admin-issue-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.admin-critical-slideover {
  background: #2f2f2f;
}

.admin-critical-source {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, #404040 82%, transparent 18%);
  padding: 0.68rem 0.75rem;
}
</style>
