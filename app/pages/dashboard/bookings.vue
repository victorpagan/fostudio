<script setup lang="ts">
import { normalizeDiscountLabel } from '~~/app/utils/membershipDiscount'

// auth only — no membership-required middleware. We handle the no-membership
// state inline so users can purchase right from this page.
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin } = useCurrentUser()
const router = useRouter()
const route = useRoute()
const toast = useToast()

type Booking = {
  id: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  credits_burned: number | null
  created_at: string
  booking_holds?: {
    id: string
    hold_start: string
    hold_end: string
    hold_type: string
  }[] | null
}

type PlanOption = {
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  credits_per_month: number
  price_cents: number
  currency: string
  discount_label?: string | null
}

type Tier = {
  id: string
  display_name: string
  description?: string | null
  booking_window_days: number
  peak_multiplier: number
  max_bank: number
  holds_included: number
  adminOnly?: boolean
  membership_plan_variations: PlanOption[]
}

type BookingPolicy = {
  memberRescheduleNoticeHours: number
}

const nowIso = useState('dashboard:bookings:now-iso', () => new Date().toISOString())
const dashboardHydrated = ref(false)

// Check membership status first (admins always pass)
const { data: membershipData } = await useAsyncData('bookings:membership', async () => {
  if (!user.value) return null
  const { data } = await supabase
    .from('memberships')
    .select('status, tier, cadence')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  return data
})

const hasMembership = computed(() =>
  isAdmin.value || (membershipData.value?.status ?? '').toLowerCase() === 'active'
)

// Only fetch bookings when membership is confirmed
const { data: upcoming, refresh: refreshUpcoming } = await useAsyncData('bookings:upcoming', async () => {
  if (!user.value || !hasMembership.value) return []
  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, notes, credits_burned, created_at, booking_holds(id,hold_start,hold_end,hold_type)')
    .eq('user_id', user.value.sub)
    .gte('start_time', nowIso.value)
    .in('status', ['confirmed', 'requested'])
    .order('start_time', { ascending: true })
    .limit(20)
  if (error) throw error
  return (data ?? []) as Booking[]
})

const { data: past, refresh: refreshPast } = await useAsyncData('bookings:past', async () => {
  if (!user.value || !hasMembership.value) return []
  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, notes, credits_burned, created_at, booking_holds(id,hold_start,hold_end,hold_type)')
    .eq('user_id', user.value.sub)
    .lt('start_time', nowIso.value)
    .order('start_time', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []) as Booking[]
})

// Fetch tiers for upsell panel (only loaded when no active membership)
const { data: catalogData } = await useAsyncData('bookings:catalog', async () => {
  if (hasMembership.value) return null
  const res = await $fetch<{ tiers: Tier[] }>('/api/membership/catalog')
  return res?.tiers ?? []
}, { watch: [hasMembership] })

const tiers = computed(() => catalogData.value ?? [])
const { data: bookingPolicy } = await useAsyncData('bookings:policy', async () => {
  return await $fetch<BookingPolicy>('/api/bookings/policy')
})
const memberRescheduleNoticeHours = computed(() => Number(bookingPolicy.value?.memberRescheduleNoticeHours ?? 24))

function getDiscountLabel(label?: string | null) {
  return normalizeDiscountLabel(label)
}

async function refreshAll() {
  await Promise.all([refreshUpcoming(), refreshPast()])
}

const cancellingId = ref<string | null>(null)
const holdCancellingId = ref<string | null>(null)
const cancelConfirmOpen = ref(false)
const cancelTarget = ref<Booking | null>(null)
const reschedulingId = ref<string | null>(null)
const rescheduleOpen = ref(false)
const rescheduleForm = reactive({
  bookingId: '',
  startTime: '',
  endTime: '',
  notes: ''
})

async function cancelBooking(id: string) {
  cancellingId.value = id
  try {
    const result = await $fetch<{
      ok: boolean
      creditsRefunded: number
      eligible_for_refund: boolean
      hours_until_start: number
    }>(`/api/bookings/${id}`, { method: 'DELETE' })

    const msg = result.creditsRefunded > 0
      ? `${result.creditsRefunded} credit${result.creditsRefunded === 1 ? '' : 's'} refunded to your balance.`
      : result.hours_until_start < 24
        ? 'No refund — cancellation within 24h of your session.'
        : 'Booking canceled.'

    toast.add({ title: 'Booking canceled', description: msg, color: 'success' })
    await refreshUpcoming()
  } catch (error: unknown) {
    const maybe = error as { message?: string }
    toast.add({ title: 'Could not cancel', description: maybe?.message ?? 'Error', color: 'error' })
  } finally {
    cancellingId.value = null
  }
}

async function cancelBookingHold(id: string) {
  holdCancellingId.value = id
  try {
    const result = await $fetch<{
      ok: boolean
      holdsRemoved: number
      holdReturned: number
      eligible_for_hold_return: boolean
      hours_until_start: number | null
      message?: string
    }>(`/api/bookings/${id}/hold`, { method: 'DELETE' })

    const msg = result.holdReturned > 0
      ? `${result.holdReturned} hold token${result.holdReturned === 1 ? '' : 's'} returned.`
      : result.message ?? 'Hold removed.'

    toast.add({ title: 'Hold updated', description: msg, color: 'success' })
    await refreshUpcoming()
    if (cancelTarget.value?.id === id && !cancellingId.value) {
      closeCancelConfirm()
    }
  } catch (error: unknown) {
    const maybe = error as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Could not cancel hold', description: maybe.data?.statusMessage ?? maybe.message ?? 'Error', color: 'error' })
  } finally {
    holdCancellingId.value = null
  }
}

function openCancelConfirm(booking: Booking) {
  cancelTarget.value = booking
  cancelConfirmOpen.value = true
}

function closeCancelConfirm() {
  if (cancellingId.value || holdCancellingId.value) return
  cancelConfirmOpen.value = false
  cancelTarget.value = null
}

async function confirmCancel() {
  if (!cancelTarget.value) return
  await cancelBooking(cancelTarget.value.id)
  if (!cancellingId.value) {
    closeCancelConfirm()
  }
}

function toLocalInputValue(value: string | null | undefined) {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  const year = dt.getFullYear()
  const month = `${dt.getMonth() + 1}`.padStart(2, '0')
  const day = `${dt.getDate()}`.padStart(2, '0')
  const hour = `${dt.getHours()}`.padStart(2, '0')
  const minute = `${dt.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

function fromLocalInputValue(value: string) {
  if (!value.trim()) return null
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function formatRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return { dateStr: `${start} to ${end}`, timeStr: '' }
  }
  const dateStr = dashboardHydrated.value
    ? s.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/Los_Angeles'
      })
    : s.toISOString().slice(0, 10)
  const startTime = dashboardHydrated.value
    ? s.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Los_Angeles'
      })
    : `${s.toISOString().slice(11, 16)} UTC`
  const endTime = dashboardHydrated.value
    ? e.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Los_Angeles'
      })
    : `${e.toISOString().slice(11, 16)} UTC`
  return { dateStr, timeStr: `${startTime} – ${endTime}` }
}

function durationLabel(start: string, end: string) {
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 3600000
  if (diff === Math.floor(diff)) return `${diff}h`
  const h = Math.floor(diff), m = Math.round((diff - h) * 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function statusColor(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'confirmed': return 'success'
    case 'requested': return 'warning'
    case 'canceled': return 'error'
    default: return 'neutral'
  }
}

function formatStatus(status: string) {
  return status
}

function hoursUntilStart(booking: Booking) {
  return (new Date(booking.start_time).getTime() - new Date(nowIso.value).getTime()) / 3600000
}

function hasPassed(booking: Booking) {
  return hoursUntilStart(booking) <= 0
}

function canCancel(booking: Booking) {
  const status = String(booking.status ?? '').toLowerCase()
  if (!['confirmed', 'requested', 'pending_payment'].includes(status)) return false
  return hoursUntilStart(booking) >= 24
}

function hasHold(booking: Booking) {
  return (booking.booking_holds?.length ?? 0) > 0
}

function canCancelHoldOnly(booking: Booking) {
  const status = String(booking.status ?? '').toLowerCase()
  if (!['confirmed', 'requested', 'pending_payment'].includes(status)) return false
  if (!hasHold(booking)) return false
  return !hasPassed(booking)
}

function holdRangeLabel(booking: Booking) {
  const hold = booking.booking_holds?.[0]
  if (!hold) return null
  return formatRange(hold.hold_start, hold.hold_end)
}

function isRefundEligible(booking: Booking) {
  return hoursUntilStart(booking) >= 24
}

function canReschedule(booking: Booking) {
  if (!['confirmed', 'requested', 'pending_payment'].includes(String(booking.status ?? '').toLowerCase())) return false
  return hoursUntilStart(booking) >= memberRescheduleNoticeHours.value
}

function rescheduleLockReason(booking: Booking) {
  if (hasPassed(booking)) return 'Reschedule unavailable: booking has already started/passed.'
  return `Reschedule locked within ${memberRescheduleNoticeHours.value}h of start.`
}

function cancelLockReason(booking: Booking) {
  if (hasPassed(booking)) return 'Cancel unavailable: booking has already started/passed.'
  return 'Cancel unavailable within 24h of booking start.'
}

function openReschedule(booking: Booking) {
  rescheduleForm.bookingId = booking.id
  rescheduleForm.startTime = toLocalInputValue(booking.start_time)
  rescheduleForm.endTime = toLocalInputValue(booking.end_time)
  rescheduleForm.notes = booking.notes ?? ''
  rescheduleOpen.value = true
}

function closeReschedule() {
  if (reschedulingId.value) return
  rescheduleOpen.value = false
  rescheduleForm.bookingId = ''
  rescheduleForm.startTime = ''
  rescheduleForm.endTime = ''
  rescheduleForm.notes = ''
}

async function clearRescheduleQuery() {
  if (!route.query.reschedule) return
  const nextQuery = { ...route.query }
  delete nextQuery.reschedule
  await router.replace({ query: nextQuery })
}

async function openRescheduleFromQuery() {
  const raw = route.query.reschedule
  const bookingId = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : null
  if (!bookingId) return
  const target = (upcoming.value ?? []).find(booking => booking.id === bookingId)
  if (!target) return
  if (!canReschedule(target)) {
    toast.add({
      title: 'Cannot reschedule this booking',
      description: rescheduleLockReason(target),
      color: 'warning'
    })
    await clearRescheduleQuery()
    return
  }
  openReschedule(target)
  await clearRescheduleQuery()
}

async function saveReschedule() {
  if (!rescheduleForm.bookingId) return
  reschedulingId.value = rescheduleForm.bookingId
  try {
    const start = fromLocalInputValue(rescheduleForm.startTime)
    const end = fromLocalInputValue(rescheduleForm.endTime)
    if (!start || !end) throw new Error('Start and end time are required')

    await $fetch(`/api/bookings/${rescheduleForm.bookingId}/reschedule`, {
      method: 'POST',
      body: {
        start_time: start,
        end_time: end,
        notes: rescheduleForm.notes || null
      }
    })
    toast.add({ title: 'Booking rescheduled', color: 'success' })
    closeReschedule()
    await refreshUpcoming()
  } catch (error: unknown) {
    const maybe = error as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Could not reschedule',
      description: maybe.data?.statusMessage ?? maybe.message ?? 'Error',
      color: 'error'
    })
  } finally {
    reschedulingId.value = null
  }
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function cadenceLabel(c: string) {
  if (c === 'daily') return 'Daily'
  if (c === 'weekly') return 'Weekly'
  if (c === 'monthly') return 'Monthly'
  if (c === 'quarterly') return 'Quarterly'
  if (c === 'annual') return 'Annual'
  return c
}

function cadencePriceUnit(cadence: string) {
  if (cadence === 'daily') return 'day'
  if (cadence === 'weekly') return 'week'
  if (cadence === 'monthly') return 'mo'
  if (cadence === 'quarterly') return 'qtr'
  if (cadence === 'annual') return 'yr'
  return cadence
}

function cadenceCreditsUnit(cadence: string) {
  if (cadence === 'daily') return 'day'
  if (cadence === 'weekly') return 'week'
  return 'mo'
}

function formatPeakCredits(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function goCheckout(tierId: string, cadence: string) {
  router.push(`/checkout?tier=${encodeURIComponent(tierId)}&cadence=${encodeURIComponent(cadence)}&returnTo=/dashboard/bookings`)
}

onMounted(() => {
  dashboardHydrated.value = true
  nowIso.value = new Date().toISOString()
  void openRescheduleFromQuery()
})

watch(
  () => [route.query.reschedule, upcoming.value?.length ?? 0],
  () => { void openRescheduleFromQuery() }
)
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <UDashboardPanel
      id="bookings"
      class="min-h-0 flex-1"
    >
      <template #header>
        <UDashboardNavbar
          title="My Bookings"
          :ui="{ right: 'gap-3' }"
        >
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <template v-if="hasMembership">
              <UButton
                size="sm"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                @click="refreshAll"
              />
              <UButton
                size="sm"
                icon="i-lucide-calendar-plus"
                to="/dashboard/book"
              >
                Book studio
              </UButton>
            </template>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <!-- ── No active membership: show tier upsell ── -->
        <div
          v-if="!hasMembership"
          class="p-4 space-y-6"
        >
          <UCard>
            <div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="font-semibold">
                  You don't have an active membership
                </p>
                <p class="mt-1 text-sm text-dimmed">
                  Choose a plan below to unlock studio booking, credits, and priority access.
                </p>
              </div>
              <UBadge
                color="warning"
                variant="soft"
              >
                No active plan
              </UBadge>
            </div>
          </UCard>

          <div class="grid gap-4 lg:grid-cols-3">
            <UCard
              v-for="tier in tiers"
              :key="tier.id"
            >
              <div class="flex items-center gap-2">
                <div class="text-base font-semibold">
                  {{ tier.display_name }}
                </div>
                <UBadge
                  v-if="tier.adminOnly"
                  color="warning"
                  variant="soft"
                  size="xs"
                  icon="i-lucide-flask-conical"
                >
                  Admin only
                </UBadge>
              </div>
              <p
                v-if="tier.description"
                class="mt-1 text-sm text-dimmed"
              >
                {{ tier.description }}
              </p>

              <div class="mt-4 grid grid-cols-3 gap-2">
                <div class="rounded-lg border border-default p-2 text-center">
                  <div class="text-sm font-medium">
                    {{ tier.booking_window_days }}d
                  </div>
                  <div class="text-xs text-dimmed">
                    booking
                  </div>
                </div>
                <div class="rounded-lg border border-default p-2 text-center">
                  <div class="text-sm font-medium">
                    {{ formatPeakCredits(tier.peak_multiplier) }} cr/hr
                  </div>
                  <div class="text-xs text-dimmed">
                    peak hour
                  </div>
                </div>
                <div class="rounded-lg border border-default p-2 text-center">
                  <div class="text-sm font-medium">
                    {{ tier.max_bank }}
                  </div>
                  <div class="text-xs text-dimmed">
                    max credits
                  </div>
                </div>
              </div>

              <div class="mt-4 space-y-2">
                <div
                  v-for="opt in tier.membership_plan_variations"
                  :key="opt.cadence"
                  class="flex items-center justify-between rounded-lg border border-default p-3"
                >
                  <div>
                    <div class="text-sm font-medium flex items-center gap-2">
                      {{ cadenceLabel(opt.cadence) }}
                      <UBadge
                        v-if="getDiscountLabel(opt.discount_label)"
                        color="neutral"
                        variant="soft"
                        size="xs"
                      >
                        {{ getDiscountLabel(opt.discount_label) }}
                      </UBadge>
                    </div>
                    <div class="text-xs text-dimmed">
                      {{ opt.credits_per_month }} credits/{{ cadenceCreditsUnit(opt.cadence) }}
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-semibold">
                      {{ formatMoney(opt.price_cents, opt.currency) }}
                    </div>
                    <div class="text-xs text-dimmed">
                      / {{ cadencePriceUnit(opt.cadence) }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="mt-4 grid gap-2">
                <UButton
                  v-for="opt in tier.membership_plan_variations"
                  :key="opt.cadence + '-cta'"
                  block
                  size="sm"
                  @click="goCheckout(tier.id, opt.cadence)"
                >
                  Start {{ tier.display_name }} · {{ cadenceLabel(opt.cadence) }}
                </UButton>
              </div>
            </UCard>
          </div>
        </div>

        <!-- ── Active membership: show bookings ── -->
        <div
          v-else
          class="p-4 space-y-6"
        >
          <UAlert
            color="neutral"
            variant="soft"
            icon="i-lucide-info"
            :description="`Reschedules require at least ${memberRescheduleNoticeHours} hours notice before the booking start time.`"
          />

          <!-- Upcoming -->
          <div>
            <h2 class="text-sm font-semibold text-muted mb-3 flex items-center gap-2">
              <UIcon
                name="i-lucide-calendar-clock"
                class="size-4"
              />
              Upcoming
            </h2>

            <div
              v-if="!upcoming?.length"
              class="rounded-lg border border-default p-6 text-center"
            >
              <UIcon
                name="i-lucide-calendar-x"
                class="size-8 text-dimmed mx-auto mb-2"
              />
              <p class="text-sm text-dimmed">
                No upcoming bookings.
              </p>
              <UButton
                class="mt-3"
                size="sm"
                to="/dashboard/book"
              >
                Book studio time
              </UButton>
            </div>

            <div
              v-else
              class="space-y-2"
            >
              <UCard
                v-for="booking in upcoming"
                :key="booking.id"
                :ui="{ body: 'p-4 sm:p-4' }"
              >
                <div class="flex items-start justify-between gap-3 flex-wrap">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <UBadge
                        :color="statusColor(booking.status)"
                        variant="soft"
                        size="sm"
                      >
                        {{ formatStatus(booking.status) }}
                      </UBadge>
                      <span class="text-sm font-medium">{{ formatRange(booking.start_time, booking.end_time).dateStr }}</span>
                    </div>
                    <p class="mt-1 text-sm text-dimmed">
                      {{ formatRange(booking.start_time, booking.end_time).timeStr }}
                      · {{ durationLabel(booking.start_time, booking.end_time) }}
                      <span v-if="booking.credits_burned"> · {{ booking.credits_burned }} credits</span>
                    </p>
                    <p
                      v-if="hasHold(booking)"
                      class="mt-1 text-xs text-amber-600 dark:text-amber-400"
                    >
                      Overnight hold attached
                      <span v-if="holdRangeLabel(booking)">
                        · {{ holdRangeLabel(booking)?.timeStr }}
                      </span>
                    </p>
                    <p
                      v-if="booking.notes"
                      class="mt-1.5 text-xs text-dimmed italic truncate max-w-sm"
                    >
                      {{ booking.notes }}
                    </p>
                  </div>
                  <div class="shrink-0 flex items-center gap-2">
                    <UTooltip
                      :text="canReschedule(booking)
                        ? `Reschedule booking (${memberRescheduleNoticeHours}+h notice)`
                        : rescheduleLockReason(booking)"
                    >
                      <UButton
                        size="sm"
                        color="neutral"
                        variant="soft"
                        :disabled="!canReschedule(booking)"
                        @click="openReschedule(booking)"
                      >
                        Reschedule
                      </UButton>
                    </UTooltip>
                    <UTooltip
                      v-if="canCancelHoldOnly(booking)"
                      :text="isRefundEligible(booking) ? 'Cancel hold only · hold token can be returned' : 'Cancel hold only · no hold return (< 24h)'"
                    >
                      <UButton
                        size="sm"
                        color="warning"
                        variant="soft"
                        :loading="holdCancellingId === booking.id"
                        @click="cancelBookingHold(booking.id)"
                      >
                        Cancel hold
                      </UButton>
                    </UTooltip>
                    <UTooltip
                      :text="canCancel(booking) ? 'Cancel · credit refund eligible' : cancelLockReason(booking)"
                    >
                      <UButton
                        size="sm"
                        color="error"
                        variant="soft"
                        :disabled="!canCancel(booking)"
                        :loading="cancellingId === booking.id"
                        @click="openCancelConfirm(booking)"
                      >
                        Cancel
                      </UButton>
                    </UTooltip>
                  </div>
                </div>
              </UCard>
            </div>
          </div>

          <!-- Past -->
          <div>
            <h2 class="text-sm font-semibold text-muted mb-3 flex items-center gap-2">
              <UIcon
                name="i-lucide-history"
                class="size-4"
              />
              Past bookings
            </h2>

            <div
              v-if="!past?.length"
              class="rounded-lg border border-default p-6 text-center"
            >
              <p class="text-sm text-dimmed">
                No booking history yet.
              </p>
            </div>

            <div
              v-else
              class="space-y-2"
            >
              <UCard
                v-for="booking in past"
                :key="booking.id"
                :ui="{ body: 'p-4 sm:p-4' }"
              >
                <div class="flex items-start gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <UBadge
                        :color="statusColor(booking.status)"
                        variant="soft"
                        size="sm"
                      >
                        {{ formatStatus(booking.status) }}
                      </UBadge>
                      <span class="text-sm font-medium">{{ formatRange(booking.start_time, booking.end_time).dateStr }}</span>
                    </div>
                    <p class="mt-1 text-sm text-dimmed">
                      {{ formatRange(booking.start_time, booking.end_time).timeStr }}
                      · {{ durationLabel(booking.start_time, booking.end_time) }}
                      <span v-if="booking.credits_burned"> · {{ booking.credits_burned }} credits</span>
                    </p>
                    <p
                      v-if="booking.notes"
                      class="mt-1.5 text-xs text-dimmed italic truncate max-w-sm"
                    >
                      {{ booking.notes }}
                    </p>
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </div>
      </template>
    </UDashboardPanel>

    <UModal
      v-model:open="rescheduleOpen"
      :dismissible="!reschedulingId"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-base font-semibold">
                Reschedule booking
              </h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="Boolean(reschedulingId)"
                @click="closeReschedule"
              />
            </div>
          </template>

          <div class="space-y-3">
            <UFormField label="Start">
              <UInput
                v-model="rescheduleForm.startTime"
                type="datetime-local"
              />
            </UFormField>
            <UFormField label="End">
              <UInput
                v-model="rescheduleForm.endTime"
                type="datetime-local"
              />
            </UFormField>
            <UFormField
              label="Notes"
              hint="Optional"
            >
              <UInput
                v-model="rescheduleForm.notes"
                placeholder="Optional update notes"
              />
            </UFormField>
            <p class="text-xs text-dimmed">
              Reschedules are available until {{ memberRescheduleNoticeHours }} hours before the session start.
            </p>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="Boolean(reschedulingId)"
                @click="closeReschedule"
              >
                Close
              </UButton>
              <UButton
                :loading="Boolean(reschedulingId)"
                @click="saveReschedule"
              >
                Save changes
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal
      v-model:open="cancelConfirmOpen"
      :dismissible="!cancellingId"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-base font-semibold">
                Cancel booking?
              </h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="Boolean(cancellingId)"
                @click="closeCancelConfirm"
              />
            </div>
          </template>

          <div
            v-if="cancelTarget"
            class="space-y-3"
          >
            <p class="text-sm text-dimmed">
              This will cancel your booking and release the time slot.
            </p>
            <div class="rounded-lg border border-default p-3 text-sm">
              <div class="font-medium">
                {{ formatRange(cancelTarget.start_time, cancelTarget.end_time).dateStr }}
              </div>
              <div class="text-dimmed">
                {{ formatRange(cancelTarget.start_time, cancelTarget.end_time).timeStr }}
              </div>
            </div>
            <UAlert
              color="warning"
              variant="soft"
              icon="i-lucide-info"
              :description="isRefundEligible(cancelTarget) ? 'Cancellation is outside 24h and credits are expected to be refunded.' : 'Cancellation is unavailable within 24h of booking start or after it has started.'"
            />
            <UAlert
              v-if="hasHold(cancelTarget)"
              color="warning"
              variant="soft"
              icon="i-lucide-package"
              :description="isRefundEligible(cancelTarget) ? 'A hold is attached. You can cancel just the hold and return a hold token, or cancel the full booking.' : 'A hold is attached. Within 24h, hold tokens are forfeited when a hold is canceled.'"
            />
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="Boolean(cancellingId) || Boolean(holdCancellingId)"
                @click="closeCancelConfirm"
              >
                Keep booking
              </UButton>
              <UButton
                v-if="cancelTarget && canCancelHoldOnly(cancelTarget)"
                color="warning"
                variant="soft"
                :loading="Boolean(holdCancellingId)"
                :disabled="Boolean(cancellingId)"
                @click="cancelBookingHold(cancelTarget.id)"
              >
                Cancel hold only
              </UButton>
              <UButton
                color="error"
                :loading="Boolean(cancellingId)"
                :disabled="Boolean(holdCancellingId) || !cancelTarget || !canCancel(cancelTarget)"
                @click="confirmCancel"
              >
                Confirm cancel
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
