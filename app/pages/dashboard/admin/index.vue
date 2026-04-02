<script setup lang="ts">
import { DateTime } from 'luxon'

definePageMeta({ middleware: ['admin'] })

type PeriodMode = 'week' | 'month' | '90d' | 'year'

type OpsResponse = {
  summary?: {
    dueGrantCount?: number
    scheduledGrantCount?: number
    membershipsNeedingAttention?: number
    guestBookings?: number
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

const quickActions = [
  {
    title: 'Ops tools',
    description: 'Grant processing, backfill controls, and guest booking monitoring.',
    icon: 'i-lucide-wrench',
    to: '/dashboard/admin/tools'
  },
  {
    title: 'Subscriptions',
    description: 'Create or edit tiers and plan variations, then sync subscription prices to Square.',
    icon: 'i-lucide-badge-check',
    to: '/dashboard/admin/subscriptions'
  },
  {
    title: 'Credits',
    description: 'Manage single-credit and bundle pricing, sale windows, and Square item linkage.',
    icon: 'i-lucide-wallet-cards',
    to: '/dashboard/admin/credits'
  },
  {
    title: 'Promo codes',
    description: 'Manage promo code inventory, validity windows, and redemption limits.',
    icon: 'i-lucide-ticket-percent',
    to: '/dashboard/admin/promos'
  },
  {
    title: 'Members',
    description: 'Review member accounts, adjust statuses, and apply manual credit corrections.',
    icon: 'i-lucide-users',
    to: '/dashboard/admin/members'
  },
  {
    title: 'Door codes',
    description: 'Manage member codes and permanent lock codes that remain active outside booking windows.',
    icon: 'i-lucide-key-round',
    to: '/dashboard/admin/door-codes'
  },
  {
    title: 'Waiver templates',
    description: 'Draft and publish member waiver versions. Publishing forces member re-signing.',
    icon: 'i-lucide-file-signature',
    to: '/dashboard/admin/waiver'
  },
  {
    title: 'Bookings',
    description: 'Review all bookings and run admin-level cancellation/refund actions.',
    icon: 'i-lucide-calendar-range',
    to: '/dashboard/admin/bookings'
  },
  {
    title: 'Calendar settings',
    description: 'Manage LA peak windows, booking windows, and blackout blocks.',
    icon: 'i-lucide-calendar-clock',
    to: '/dashboard/admin/calendar'
  },
  {
    title: 'Google Calendar',
    description: 'Connect and sync the external Peerspace Google Calendar into booking availability blocks.',
    icon: 'i-lucide-calendar-sync',
    to: '/dashboard/admin/google-calendar'
  },
  {
    title: 'Email',
    description: 'Manage customer mail preferences, admin copy behavior, and SendGrid template mappings.',
    icon: 'i-lucide-mail',
    to: '/dashboard/admin/email'
  },
  {
    title: 'Email campaigns',
    description: 'Build draft campaigns, choose a campaign template, and send member broadcast mailings.',
    icon: 'i-lucide-megaphone',
    to: '/dashboard/admin/email-campaigns'
  },
  {
    title: 'Holds',
    description: 'Configure hold fallback, hold top-up settings, and sync the hold item to Square.',
    icon: 'i-lucide-package-plus',
    to: '/dashboard/admin/holds'
  }
]

const periodMode = ref<PeriodMode>('month')
const periodAnchorIso = ref(DateTime.utc().toISODate() ?? DateTime.now().toISODate() ?? '')
const nowUtc = computed(() => DateTime.utc().endOf('day'))

function anchorDate() {
  const parsed = DateTime.fromISO(periodAnchorIso.value, { zone: 'utc' })
  if (parsed.isValid) return parsed.endOf('day')
  return DateTime.utc().endOf('day')
}

function clampToNow(date: DateTime) {
  return date > nowUtc.value ? nowUtc.value : date
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
  const start = activeRange.value.start.setZone('America/Los_Angeles')
  const end = activeRange.value.end.setZone('America/Los_Angeles')
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
  if (anchor >= nowUtc.value.startOf('day')) return false
  if (periodMode.value === 'week') return anchor.plus({ weeks: 1 }).startOf('week') <= nowUtc.value
  if (periodMode.value === 'year') return anchor.plus({ years: 1 }).startOf('year') <= nowUtc.value
  if (periodMode.value === '90d') return anchor.plus({ days: 90 }) <= nowUtc.value
  return anchor.plus({ months: 1 }).startOf('month') <= nowUtc.value
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

onMounted(async () => {
  await refresh()
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
const criticalIssues = computed(() => data.value?.criticalIssues ?? [])
const campaignReminders = computed(() => data.value?.campaignReminders ?? [])

function formatMoney(cents: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    .format((Number(cents ?? 0) || 0) / 100)
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—'
  const parsed = DateTime.fromISO(value, { zone: 'utc' })
  if (!parsed.isValid) return value
  return parsed.setZone('America/Los_Angeles').toFormat('LLL d')
}

function issueTone(severity: string) {
  if (severity === 'error') return 'error'
  if (severity === 'warning') return 'warning'
  if (severity === 'success') return 'success'
  return 'neutral'
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
    class="min-h-0 flex-1"
  >
    <template #header>
      <UDashboardNavbar
        title="Ops Overview"
        :ui="{ right: 'gap-2' }"
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
      <div class="admin-ops-shell h-full overflow-y-auto p-4 sm:p-5 md:p-6 space-y-4 md:space-y-5">
        <section class="admin-ops-hero rounded-2xl p-4 sm:p-5 md:p-6">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div class="space-y-2">
              <p class="text-[11px] uppercase tracking-[0.22em] text-dimmed">
                Revenue + Critical Operations
              </p>
              <h1 class="text-2xl sm:text-3xl font-[var(--font-display)] font-light leading-tight text-highlighted">
                Sales, access, and membership ops in one view.
              </h1>
              <p class="max-w-3xl text-sm text-toned">
                Monitor cash movement, access incidents, grant pressure, and member activity from a single dashboard state.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-chevron-left"
                @click="stepPeriod(-1)"
              />
              <div class="rounded-xl bg-elevated/55 px-3 py-2 text-xs text-toned min-w-48 text-center">
                {{ rangeLabel }}
              </div>
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
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
              :variant="periodMode === mode.value ? 'solid' : 'soft'"
              @click="periodMode = mode.value"
            >
              {{ mode.label }}
            </UButton>
          </div>
        </section>

        <section class="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              Membership sales
            </div>
            <div class="mt-2 text-3xl font-[var(--font-display)] font-light">
              {{ formatMoney(data?.summary?.membershipRevenueCents) }}
            </div>
            <p class="mt-2 text-xs text-dimmed">
              Credit topups: {{ formatMoney(data?.summary?.creditTopupRevenueCents) }}
            </p>
          </UCard>

          <UCard class="admin-kpi-card border-0">
            <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
              Critical pressure
            </div>
            <div class="mt-2 text-3xl font-[var(--font-display)] font-light">
              {{ (data?.summary?.openLockIncidents ?? 0) + (data?.summary?.deadLockJobs ?? 0) + (data?.summary?.dueGrantCount ?? 0) }}
            </div>
            <p class="mt-2 text-xs text-dimmed">
              Incidents, dead jobs, and due grants combined
            </p>
          </UCard>

          <UCard class="admin-kpi-card border-0">
            <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
              Active demand
            </div>
            <div class="mt-2 text-3xl font-[var(--font-display)] font-light">
              {{ data?.summary?.guestBookings ?? 0 }}
            </div>
            <p class="mt-2 text-xs text-dimmed">
              Guest bookings in recent snapshot
            </p>
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

          <div class="grid gap-3 sm:gap-4">
            <UCard class="admin-panel-card border-0">
              <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                Revenue mix
              </div>
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

        <section class="grid gap-3 sm:gap-4 xl:grid-cols-[1.2fr_1fr]">
          <UCard class="admin-panel-card border-0">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                  Top members
                </div>
                <h2 class="mt-1 text-xl font-[var(--font-display)] font-light">
                  Revenue + usage leaders
                </h2>
              </div>
            </div>

            <div class="mt-3 overflow-x-auto">
              <table class="min-w-full text-sm admin-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Revenue</th>
                    <th>Bookings</th>
                    <th>Credits</th>
                    <th>Last booking</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="member in topMembers"
                    :key="member.userId"
                  >
                    <td>
                      <div class="font-medium text-highlighted">
                        {{ member.name || member.email || member.userId }}
                      </div>
                      <div class="text-xs text-dimmed">
                        {{ member.email || member.userId }}
                      </div>
                    </td>
                    <td>{{ formatMoney(member.revenueCents) }}</td>
                    <td>{{ member.bookings }}</td>
                    <td>{{ member.creditsBurned }}</td>
                    <td>{{ formatShortDate(member.lastBookingAt) }}</td>
                  </tr>
                  <tr v-if="!topMembers.length">
                    <td
                      colspan="5"
                      class="text-center text-dimmed py-5"
                    >
                      No member activity in selected period.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <div class="grid gap-3 sm:gap-4">
            <UCard class="admin-panel-card border-0">
              <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                Critical issues
              </div>
              <div class="mt-3 space-y-2">
                <NuxtLink
                  v-for="issue in criticalIssues"
                  :key="issue.id"
                  :to="issue.to"
                  class="admin-issue-row"
                >
                  <div>
                    <div class="text-sm font-medium text-highlighted">
                      {{ issue.title }}
                    </div>
                    <div class="text-xs text-dimmed">
                      {{ issue.description }}
                    </div>
                  </div>
                  <UBadge
                    size="sm"
                    :color="issueTone(issue.severity)"
                    variant="soft"
                  >
                    {{ issue.count }}
                  </UBadge>
                </NuxtLink>
                <div
                  v-if="!criticalIssues.length"
                  class="text-xs text-dimmed rounded-lg bg-elevated/45 px-3 py-2"
                >
                  No active critical flags right now.
                </div>
              </div>
            </UCard>

            <UCard class="admin-panel-card border-0">
              <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
                Campaign reminders
              </div>
              <div class="mt-3 space-y-2">
                <NuxtLink
                  v-for="item in campaignReminders"
                  :key="item.id"
                  :to="item.to"
                  class="admin-reminder-row"
                >
                  <div class="text-sm font-medium text-highlighted">
                    {{ item.title }}
                  </div>
                  <div class="text-xs text-dimmed">
                    {{ item.description }}
                  </div>
                  <div class="text-[11px] uppercase tracking-[0.16em] text-primary">
                    {{ item.dueLabel }}
                  </div>
                </NuxtLink>
              </div>
            </UCard>
          </div>
        </section>

        <section class="space-y-2">
          <div class="text-[11px] uppercase tracking-[0.2em] text-dimmed">
            Quick actions
          </div>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <UCard
              v-for="section in quickActions"
              :key="section.to"
              class="admin-action-card border-0"
            >
              <div class="flex h-full flex-col">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="section.icon"
                    class="size-5 text-primary"
                  />
                  <div class="font-medium">
                    {{ section.title }}
                  </div>
                </div>
                <p class="mt-2 text-sm text-dimmed flex-1">
                  {{ section.description }}
                </p>
                <UButton
                  class="mt-4"
                  :to="section.to"
                  size="sm"
                >
                  Open
                </UButton>
              </div>
            </UCard>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.admin-ops-shell {
  position: relative;
}

.admin-ops-shell::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(900px 420px at 78% -10%, color-mix(in srgb, var(--gruv-accent) 17%, transparent), transparent 62%),
    radial-gradient(760px 420px at 12% 110%, color-mix(in srgb, var(--gruv-aqua) 14%, transparent), transparent 58%);
  opacity: 0.92;
}

.admin-ops-shell > * {
  position: relative;
  z-index: 1;
}

.admin-ops-hero {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--gruv-accent) 16%, var(--ui-bg) 84%), color-mix(in srgb, var(--gruv-bg-1) 72%, transparent 28%));
}

.admin-kpi-card,
.admin-panel-card,
.admin-action-card {
  background: color-mix(in srgb, var(--ui-bg-elevated) 56%, transparent 44%);
  box-shadow: none;
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

.admin-table th {
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--ui-text-dimmed);
  padding: 0.5rem 0.7rem;
}

.admin-table td {
  padding: 0.56rem 0.7rem;
  color: var(--ui-text-toned);
  border-top: 1px solid color-mix(in srgb, var(--ui-border) 70%, transparent 30%);
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
</style>
