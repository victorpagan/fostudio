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
  recentLockIncidents?: Array<{
    id: string
    incident_type: string
    severity: string
    status: string
    title: string
    message: string | null
    booking_id: string | null
    user_id: string | null
    created_at: string
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
const revenueScrollRef = ref<HTMLElement | null>(null)
const revenueSeekValue = ref(0)
const revenueSeekMax = ref(0)
const revenueCanScrollLeft = ref(false)
const revenueCanScrollRight = ref(false)
const revenueIsScrolling = ref(false)
const revenueHasUserScrolled = ref(false)

let revenueScrollIdleTimer: ReturnType<typeof setTimeout> | null = null

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

function updateRevenueSeekState() {
  const host = revenueScrollRef.value
  if (!host) {
    revenueSeekValue.value = 0
    revenueSeekMax.value = 0
    revenueCanScrollLeft.value = false
    revenueCanScrollRight.value = false
    return
  }

  const max = Math.max(0, host.scrollWidth - host.clientWidth)
  revenueSeekMax.value = max
  revenueSeekValue.value = Math.min(max, host.scrollLeft)
  revenueCanScrollLeft.value = host.scrollLeft > 6
  revenueCanScrollRight.value = host.scrollLeft < (max - 6)
}

function snapRevenueScrollToStep() {
  const host = revenueScrollRef.value
  if (!host || revenueSeekMax.value <= 0) return

  const columns = host.querySelectorAll<HTMLElement>('.admin-revenue-chart-col')
  if (columns.length < 2) return

  const firstColumn = columns.item(0)
  const secondColumn = columns.item(1)
  if (!firstColumn || !secondColumn) return

  const step = secondColumn.offsetLeft - firstColumn.offsetLeft
  if (!Number.isFinite(step) || step <= 0) return

  const snapped = Math.round(host.scrollLeft / step) * step
  const target = Math.max(0, Math.min(revenueSeekMax.value, snapped))
  host.scrollTo({ left: target, behavior: 'smooth' })
}

function handleRevenueScroll() {
  revenueIsScrolling.value = true
  if (revenueScrollRef.value && revenueScrollRef.value.scrollLeft > 6) {
    revenueHasUserScrolled.value = true
  }
  updateRevenueSeekState()

  if (revenueScrollIdleTimer) {
    clearTimeout(revenueScrollIdleTimer)
  }

  revenueScrollIdleTimer = setTimeout(() => {
    revenueIsScrolling.value = false
    snapRevenueScrollToStep()
  }, 170)
}

function onRevenueSeekInput(event: Event) {
  const host = revenueScrollRef.value
  if (!host) return
  const target = event.target as HTMLInputElement | null
  if (!target) return
  const next = Number(target.value)
  host.scrollLeft = Number.isFinite(next) ? next : 0
  if (host.scrollLeft > 6) revenueHasUserScrolled.value = true
}

onMounted(async () => {
  periodAnchorIso.value = DateTime.now().setZone(OPS_TIMEZONE).toISODate() ?? periodAnchorIso.value
  await refresh()
  await nextTick()
  updateOpsScrollState()

  const host = opsScrollRef.value
  host?.addEventListener('scroll', handleOpsScroll, { passive: true })
  revenueScrollRef.value?.addEventListener('scroll', handleRevenueScroll, { passive: true })
  window.addEventListener('resize', updateOpsScrollState)
  window.addEventListener('resize', updateRevenueSeekState)
  updateRevenueSeekState()
})

onBeforeUnmount(() => {
  const host = opsScrollRef.value
  host?.removeEventListener('scroll', handleOpsScroll)
  revenueScrollRef.value?.removeEventListener('scroll', handleRevenueScroll)
  window.removeEventListener('resize', updateOpsScrollState)
  window.removeEventListener('resize', updateRevenueSeekState)

  if (revenueScrollIdleTimer) {
    clearTimeout(revenueScrollIdleTimer)
    revenueScrollIdleTimer = null
  }
})

watch([data, pending], async () => {
  await nextTick()
  updateOpsScrollState()
  updateRevenueSeekState()
  if (revenueSeekValue.value <= 6) {
    revenueHasUserScrolled.value = false
  }
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
const recentLockIncidents = computed(() => data.value?.recentLockIncidents ?? [])
const usageLeaders = computed(() => (
  topMembers.value
    .filter(member => Number(member.revenueCents ?? 0) > 0)
    .slice(0, 4)
))
const revenueChartMinWidth = computed(() => {
  const points = Math.max(1, revenueSeries.value.length)
  return `${Math.max(560, points * 64)}px`
})
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
    to: '/dashboard/admin/door-codes'
  },
  {
    id: 'dead-jobs',
    title: 'Dead lock jobs',
    count: Number(data.value?.summary?.deadLockJobs ?? 0),
    description: 'Background lock jobs that exhausted retries and require retry/remediation.',
    to: '/dashboard/admin/door-codes'
  },
  {
    id: 'due-grants',
    title: 'Credit grants due',
    count: Number(data.value?.summary?.dueGrantCount ?? 0),
    description: 'Scheduled credit grants now due for processing.',
    to: '/dashboard/admin/subscriptions'
  },
  {
    id: 'missing-future-schedules',
    title: 'Missing future grant schedules',
    count: Number(data.value?.summary?.membershipsMissingFutureSchedule ?? 0),
    description: 'Extended memberships missing future grant rows.',
    to: '/dashboard/admin/subscriptions'
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
      <div class="admin-ops-shell-frame h-full">
        <div
          class="admin-ops-shell-shadow admin-ops-shell-shadow--top"
          :class="{ 'is-visible': opsCanScrollUp }"
        />
        <div
          class="admin-ops-shell-shadow admin-ops-shell-shadow--bottom"
          :class="{ 'is-visible': opsCanScrollDown }"
        />
        <div
          ref="opsScrollRef"
          class="admin-ops-shell h-full overflow-y-auto p-4 sm:p-5 md:p-6 space-y-4 md:space-y-5"
        >
          <section class="admin-ops-hero rounded-2xl p-4 sm:p-5 md:p-6">
            <div class="admin-hero-grid gap-4">
              <div class="space-y-2">
                <p class="text-[11px] uppercase tracking-[0.22em] text-dimmed">
                  Revenue + Critical Operations
                </p>
                <p class="max-w-3xl text-sm text-toned">
                  Selected range drives all totals, trend bars, and pressure signals.
                </p>
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
              </div>
              <div class="admin-period-toolbar">
                <UButton
                  class="admin-period-nav-btn"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-left"
                  @click="stepPeriod(-1)"
                />
                <div class="admin-range-label text-center">
                  {{ rangeLabel }}
                </div>
                <UButton
                  class="admin-period-nav-btn"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-right"
                  :disabled="!canStepForward"
                  @click="stepPeriod(1)"
                />
              </div>
            </div>
          </section>

          <section class="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OpsKpiCard card-class="admin-kpi-card admin-kpi-card--revenue">
              <div class="text-[11px] uppercase tracking-[0.2em] text-inverted/85">
                Revenue
              </div>
              <div class="mt-2 text-3xl font-[var(--font-display)] font-light text-inverted">
                {{ formatMoney(data?.summary?.totalRevenueCents) }}
              </div>
              <p class="mt-2 text-xs text-inverted/80">
                {{ data?.summary?.totalOrders ?? 0 }} paid transactions in range
              </p>
            </OpsKpiCard>

            <OpsKpiCard
              card-class="admin-kpi-card admin-kpi-card--pressure"
              show-link-action
              show-notification-action
              :notification-disabled="true"
              link-aria-label="Open critical pressure sources"
              @link="criticalDetailsOpen = true"
            >
              <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                Critical pressure
              </div>
              <div class="mt-2 text-3xl font-[var(--font-display)] font-light">
                {{ criticalPressureTotal }}
              </div>
              <p class="mt-2 text-xs text-dimmed">
                Incidents + dead jobs + due grants
              </p>
            </OpsKpiCard>

            <OpsKpiCard card-class="admin-kpi-card">
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
            </OpsKpiCard>

            <OpsKpiCard card-class="admin-kpi-card">
              <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                Analytics workspace
              </div>
              <div class="mt-2 text-2xl font-[var(--font-display)] font-light">
                KPI + trends
              </div>
              <p class="mt-2 text-xs text-dimmed">
                Review generated metrics, alerts, and weekly report outputs.
              </p>
              <UButton
                class="mt-3 w-fit"
                size="xs"
                color="primary"
                variant="soft"
                to="/dashboard/admin/analytics"
              >
                Open analytics
              </UButton>
            </OpsKpiCard>
          </section>

          <section class="grid gap-3 sm:gap-4 xl:grid-cols-[1.6fr_1fr]">
            <UCard
              class="admin-panel-card border-0 admin-revenue-panel h-full"
              :ui="{ root: 'h-full flex flex-col', body: 'h-full flex flex-col min-h-0' }"
            >
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

              <div class="admin-revenue-body mt-4">
                <div
                  :class="{ 'is-visible': revenueHasUserScrolled && revenueCanScrollLeft }"
                />
                <div
                  :class="{ 'is-visible': revenueHasUserScrolled && revenueCanScrollRight }"
                />
                <div
                  ref="revenueScrollRef"
                  class="admin-revenue-scroll"
                  :class="{ 'admin-revenue-scroll--scrolling': revenueIsScrolling }"
                >
                  <div
                    class="admin-revenue-chart"
                    :style="{ minWidth: revenueChartMinWidth }"
                  >
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
                </div>
                <div
                  class="admin-revenue-seek mt-2"
                  :class="{ 'admin-revenue-seek--disabled': revenueSeekMax <= 0 }"
                >
                  <input
                    class="admin-revenue-seek-input"
                    type="range"
                    min="0"
                    :max="revenueSeekMax"
                    :step="1"
                    :value="revenueSeekValue"
                    :disabled="revenueSeekMax <= 0"
                    @input="onRevenueSeekInput"
                  >
                </div>
                <div class="admin-revenue-legend mt-3 flex flex-wrap gap-2 text-[11px]">
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

            <UCard
              class="border-0 admin-usage-panel"
              :ui="{ root: 'bg-transparent shadow-none ring-0', body: 'bg-transparent' }"
            >
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
                  v-for="(member, index) in usageLeaders"
                  :key="member.userId"
                  class="admin-leader-tile"
                  :class="{ 'admin-leader-tile--top': index === 0 }"
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

              <UCard class="admin-panel-card border-0 md:col-span-2">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                      Recent lock incidents
                    </div>
                    <p class="mt-1 text-xs text-dimmed">
                      Latest access incidents requiring manual verification.
                    </p>
                  </div>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-panel-right"
                    @click="criticalDetailsOpen = true"
                  >
                    See sources
                  </UButton>
                </div>

                <div
                  v-if="!recentLockIncidents.length"
                  class="mt-3 rounded-lg border border-default/60 bg-elevated/45 p-3 text-xs text-dimmed"
                >
                  No lock incidents recorded.
                </div>

                <div
                  v-else
                  class="mt-3 space-y-2"
                >
                  <div
                    v-for="incident in recentLockIncidents.slice(0, 6)"
                    :key="incident.id"
                    class="rounded-lg border border-default/60 bg-elevated/45 p-3"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-sm font-medium text-highlighted">
                        {{ incident.title }}
                      </div>
                      <UBadge
                        size="xs"
                        :color="incident.severity === 'critical' ? 'error' : incident.severity === 'warning' ? 'warning' : 'neutral'"
                        variant="soft"
                      >
                        {{ incident.severity }}
                      </UBadge>
                    </div>
                    <div class="mt-1 text-xs text-dimmed">
                      {{ incident.incident_type }} · {{ incident.status }} · {{ formatShortDate(incident.created_at) }}
                    </div>
                    <div
                      v-if="incident.message"
                      class="mt-1 text-xs text-dimmed"
                    >
                      {{ incident.message }}
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
          </section>

          <section>
            <UCard class="admin-panel-card border-0">
              <div class="space-y-3">
                <div>
                  <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                    Live calendar
                  </div>
                  <p class="mt-1 text-xs text-dimmed">
                    Always-on schedule reference for current bookings, holds, and external blocks.
                  </p>
                </div>
                <AvailabilityCalendar
                  endpoint="/api/calendar/public"
                  :full-day="true"
                />
              </div>
            </UCard>
          </section>
        </div>
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
  --ui-bg-elevated: #dadbdc;
  --ui-bg-muted: #cfd1d3;
  --ui-border: rgba(18, 24, 32, 0.18);
  --admin-ops-navbar-bg: color-mix(in srgb, #dadbdc 94%, #c8cdd3 6%);
  --admin-ops-shell-bg: #cfd1d3;
  --admin-ops-shell-accent-strength: 7%;
  --admin-ops-shell-aqua-strength: 7%;
}

.admin-ops-navbar {
  background: var(--admin-ops-navbar-bg);
}

.admin-ops-shell-frame {
  position: relative;
  border-radius: 1rem 0 0 0;
  overflow: hidden;
}

.admin-ops-shell-shadow {
  position: absolute;
  left: 0;
  right: 0;
  height: 2.1rem;
  pointer-events: none;
  opacity: 0;
  transition: opacity 160ms ease-out;
  z-index: 4;
}

.admin-ops-shell-shadow--top {
  top: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.52), transparent);
}

.admin-ops-shell-shadow--bottom {
  bottom: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.52), transparent);
}

.admin-ops-shell-shadow.is-visible {
  opacity: 1;
}

.admin-ops-shell {
  position: relative;
  background:
    radial-gradient(900px 420px at 78% -10%, color-mix(in srgb, var(--gruv-accent) var(--admin-ops-shell-accent-strength), transparent), transparent 62%),
    radial-gradient(760px 420px at 12% 110%, color-mix(in srgb, var(--gruv-aqua) var(--admin-ops-shell-aqua-strength), transparent), transparent 58%),
    var(--admin-ops-shell-bg);
  border-radius: 1rem 0 0 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.admin-ops-shell > * {
  position: relative;
  z-index: 1;
}

:global(.dark) .admin-ops-panel,
:global(.dark-mode) .admin-ops-panel,
:global([data-theme='dark']) .admin-ops-panel,
:global([data-color-mode='dark']) .admin-ops-panel,
:global(html.dark) .admin-ops-panel,
:global(html.dark-mode) .admin-ops-panel,
:global(html[data-theme='dark']) .admin-ops-panel,
:global(html[data-color-mode='dark']) .admin-ops-panel {
  background: #2b2b2b !important;
  --ui-text: #e9e9e9;
  --ui-text-toned: #d2d2d2;
  --ui-text-dimmed: #a9a9a9;
  --ui-text-highlighted: #f7f7f7;
  --ui-text-inverted: #f7f7f7;
  --ui-bg-elevated: #343434;
  --ui-bg-muted: #2f2f2f;
  --ui-border: rgba(255, 255, 255, 0.14);
  --admin-ops-navbar-bg: color-mix(in srgb, #2b2b2b 94%, #1a1a1a 6%);
  --admin-ops-shell-bg: #222222;
  --admin-ops-shell-accent-strength: 12%;
  --admin-ops-shell-aqua-strength: 10%;
}

:global(.dark) .admin-ops-shell,
:global(.dark-mode) .admin-ops-shell,
:global([data-theme='dark']) .admin-ops-shell,
:global([data-color-mode='dark']) .admin-ops-shell,
:global(html.dark) .admin-ops-shell,
:global(html.dark-mode) .admin-ops-shell,
:global(html[data-theme='dark']) .admin-ops-shell,
:global(html[data-color-mode='dark']) .admin-ops-shell {
  --admin-ops-shell-bg: #222222 !important;
  --admin-ops-shell-accent-strength: 12% !important;
  --admin-ops-shell-aqua-strength: 10% !important;
}

.admin-ops-hero {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--gruv-accent) 16%, var(--ui-bg) 84%), color-mix(in srgb, var(--gruv-bg-1) 72%, transparent 28%));
}

.admin-hero-grid {
  display: grid;
  grid-template-columns: 1fr;
  align-items: center;
}

@media (min-width: 1024px) {
  .admin-hero-grid {
    grid-template-columns: minmax(0, 1fr) minmax(16rem, 32rem);
    column-gap: 1rem;
  }
}

.admin-period-toolbar {
  border: 0;
  align-self: stretch;
  min-height: clamp(3rem, 7vw, 4.75rem);
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.admin-period-nav-btn {
  height: 100%;
  min-width: clamp(2.4rem, 5vw, 3.15rem);
  padding-inline: 0.25rem;
}

.admin-range-label {
  font-family: 'Avenir Next Condensed', 'Roboto Condensed', 'Sora', 'Manrope', sans-serif;
  flex: 1 1 auto;
  min-width: 14rem;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(2rem, 4.2vw, 3.45rem);
  line-height: 0.9;
  letter-spacing: 0.06em;
  font-weight: 300;
  white-space: nowrap;
  background-image: linear-gradient(120deg, var(--gruv-accent-strong), var(--gruv-accent), color-mix(in srgb, var(--gruv-accent) 72%, #ff9bb0 28%));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.admin-kpi-shell,
:deep(.admin-kpi-card),
.admin-panel-card {
  --admin-kpi-surface: #dadbdc;
  background: var(--admin-kpi-surface);
  border-radius: 1rem;
  box-shadow: none;
}

:global(.dark) .admin-kpi-shell,
:global(.dark-mode) .admin-kpi-shell,
:global([data-theme='dark']) .admin-kpi-shell,
:global([data-color-mode='dark']) .admin-kpi-shell,
:global(html.dark) .admin-kpi-shell,
:global(html.dark-mode) .admin-kpi-shell,
:global(html[data-theme='dark']) .admin-kpi-shell,
:global(html[data-color-mode='dark']) .admin-kpi-shell,
:global(.dark) :deep(.admin-kpi-card),
:global(.dark-mode) :deep(.admin-kpi-card),
:global([data-theme='dark']) :deep(.admin-kpi-card),
:global([data-color-mode='dark']) :deep(.admin-kpi-card),
:global(html.dark) :deep(.admin-kpi-card),
:global(html.dark-mode) :deep(.admin-kpi-card),
:global(html[data-theme='dark']) :deep(.admin-kpi-card),
:global(html[data-color-mode='dark']) :deep(.admin-kpi-card),
:global(.dark) .admin-panel-card,
:global(.dark-mode) .admin-panel-card,
:global([data-theme='dark']) .admin-panel-card,
:global([data-color-mode='dark']) .admin-panel-card,
:global(html.dark) .admin-panel-card,
:global(html.dark-mode) .admin-panel-card,
:global(html[data-theme='dark']) .admin-panel-card,
:global(html[data-color-mode='dark']) .admin-panel-card {
  --admin-kpi-surface: color-mix(in srgb, #343434 88%, #2f2f2f 12%);
}

.admin-panel-card--transparent {
  background: transparent;
}

.admin-kpi-card--accent,
:deep(.admin-kpi-card--accent) {
  --admin-kpi-surface: linear-gradient(152deg, var(--gruv-accent), var(--gruv-accent-strong));
  background: linear-gradient(152deg, var(--gruv-accent), var(--gruv-accent-strong));
}

.admin-kpi-card--revenue,
:deep(.admin-kpi-card--revenue) {
  --admin-kpi-surface: var(--gruv-accent);
  background: var(--gruv-accent);
}

.admin-usage-panel,
:deep(.admin-usage-panel) {
  background: transparent !important;
}

.admin-revenue-panel {
  display: flex;
  flex-direction: column;
  min-height: 24rem;
  height: 100%;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.admin-revenue-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.admin-revenue-shadow {
  position: absolute;
  top: 0;
  bottom: 2rem;
  width: 1.6rem;
  pointer-events: none;
  opacity: 0;
  transition: opacity 160ms ease-out;
  z-index: 3;
}

.admin-revenue-shadow--left {
  left: 0;
  background: linear-gradient(to right, rgba(0, 0, 0, 0.42), transparent);
}

.admin-revenue-shadow--right {
  right: 0;
  background: linear-gradient(to left, rgba(0, 0, 0, 0.42), transparent);
}

.admin-revenue-shadow.is-visible {
  opacity: 1;
}

.admin-revenue-scroll {
  flex: 1;
  min-height: 14rem;
  overflow-x: scroll;
  overflow-y: hidden;
  padding-bottom: 0.15rem;
  scrollbar-gutter: stable both-edges;
  scrollbar-width: thin;
  touch-action: pan-x;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  scrollbar-color: color-mix(in srgb, var(--gruv-accent) 74%, transparent 26%) color-mix(in srgb, var(--ui-bg-muted) 72%, transparent 28%);
}

.admin-revenue-scroll::-webkit-scrollbar {
  height: 8px;
}

.admin-revenue-scroll.admin-revenue-scroll--scrolling {
  scrollbar-width: none;
}

.admin-revenue-scroll.admin-revenue-scroll--scrolling::-webkit-scrollbar {
  height: 0;
}

.admin-revenue-scroll::-webkit-scrollbar-track {
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-muted) 72%, transparent 28%);
}

.admin-revenue-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: linear-gradient(90deg, var(--gruv-accent-strong), var(--gruv-accent));
}

.admin-revenue-scroll::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(90deg, var(--gruv-accent), color-mix(in srgb, var(--gruv-accent) 76%, white 24%));
}

.admin-revenue-chart {
  height: 100%;
  min-height: 14rem;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(56px, 1fr);
  gap: 0.45rem;
  align-items: end;
}

.admin-revenue-chart-col {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-width: 0;
}

.admin-revenue-bar-shell {
  flex: 1;
  min-height: 10.5rem;
  border-radius: 0.62rem;
  background: color-mix(in srgb, var(--ui-bg-muted) 62%, transparent 38%);
  padding: 0.2rem;
  display: flex;
  align-items: stretch;
}

.admin-revenue-seek {
  opacity: 1;
}

.admin-revenue-seek--disabled {
  opacity: 0.45;
}

.admin-revenue-seek-input {
  width: 100%;
  appearance: none;
  height: 12px;
  background: transparent;
}

.admin-revenue-seek-input::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg-muted) 72%, transparent 28%);
}

.admin-revenue-seek-input::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  margin-top: -5px;
  border-radius: 999px;
  border: 0;
  background: linear-gradient(135deg, var(--gruv-accent), var(--gruv-accent-strong));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-bg) 72%, transparent 28%);
  cursor: pointer;
}

.admin-revenue-seek-input::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  border: 0;
  background: color-mix(in srgb, var(--ui-bg-muted) 72%, transparent 28%);
}

.admin-revenue-seek-input::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 0;
  background: linear-gradient(135deg, var(--gruv-accent), var(--gruv-accent-strong));
  cursor: pointer;
}

.admin-revenue-legend {
  margin-top: 0.6rem;
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
  background: color-mix(in srgb, var(--ui-bg-elevated) 88%, var(--ui-bg-muted) 12%);
  border: 0;
}

.admin-leader-tile:hover {
  background: color-mix(in srgb, var(--ui-bg-elevated) 78%, var(--ui-bg-muted) 22%);
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
  background: color-mix(in srgb, var(--ui-bg-muted) 72%, transparent 28%);
}

.admin-leader-value {
  font-size: 1.52rem;
  line-height: 1;
  letter-spacing: 0.01em;
  color: color-mix(in srgb, var(--gruv-accent) 82%, #ffe7a0 18%);
}

.admin-leader-tile--top {
  background: linear-gradient(152deg, var(--gruv-accent), var(--gruv-accent-strong)) !important;
}

.admin-leader-tile--top .text-highlighted,
.admin-leader-tile--top .text-dimmed {
  color: color-mix(in srgb, #fff 92%, transparent 8%) !important;
}

.admin-leader-tile--top .admin-leader-avatar {
  background: color-mix(in srgb, #fff 24%, transparent 76%) !important;
  color: #fff;
}

.admin-leader-tile--top .admin-leader-value {
  color: #fff;
}

.admin-leader-tile--top .admin-leader-pill {
  color: color-mix(in srgb, #fff 94%, transparent 6%);
  background: color-mix(in srgb, #fff 22%, transparent 78%);
}

.admin-leader-tile--top .admin-leader-arrow {
  color: color-mix(in srgb, #fff 94%, transparent 6%);
  background: color-mix(in srgb, #fff 22%, transparent 78%);
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
  background: color-mix(in srgb, var(--ui-bg-muted) 72%, transparent 28%);
}

.admin-leader-arrow {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--ui-text-dimmed) 92%, #101828 8%);
  background: color-mix(in srgb, var(--ui-bg-muted) 72%, transparent 28%);
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
  background: color-mix(in srgb, var(--ui-bg-elevated) 56%, transparent 44%);
}

.admin-critical-source {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--ui-bg-elevated) 58%, transparent 42%);
  padding: 0.68rem 0.75rem;
}
</style>
