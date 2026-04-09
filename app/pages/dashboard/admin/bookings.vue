<script setup lang="ts">
import { DateTime } from 'luxon'
import type { AdminBookingForReschedule } from '~~/app/composables/booking/reschedule/useAdminBookingReschedule'
import { useAdminBookingReschedule } from '~~/app/composables/booking/reschedule/useAdminBookingReschedule'
import AdminRescheduleModal from '~~/app/components/booking/reschedule/modal/AdminRescheduleModal.vue'
import AvailabilityCalendar from '~~/app/components/AvailabilityCalendar.vue'

definePageMeta({ middleware: ['admin'] })

type AdminBooking = {
  id: string
  user_id: string | null
  customer_id: string | null
  start_time: string
  end_time: string
  status: string
  credits_burned: number | null
  guest_name: string | null
  guest_email: string | null
  notes: string | null
  created_at: string
  updated_at: string
  member_name: string | null
  member_email: string | null
  is_guest: boolean
  booking_holds?: {
    id: string
    hold_start: string
    hold_end: string
    hold_type: string
  }[] | null
}

type AdminMember = {
  user_id: string
  customer_first_name: string | null
  customer_last_name: string | null
  customer_email: string | null
  credit_balance: number | null
  effective_status: string
  tier: string | null
}

type AdminCreateBookingResponse = {
  burnCredits: boolean
  bookingId: string | null
  holdId: string | null
  burned: number | null
  newBalance: number | null
}

type BookingGroup = {
  key: string
  label: string
  items: AdminBooking[]
}

const PAST_BOOKINGS_PAGE_SIZE = 10
type AdminBookingTab = 'active' | 'holds' | 'past'

const toast = useToast()
const statusFilter = ref<string>('all')
const refundCredits = ref(true)
const cancelingId = ref<string | null>(null)
const bookingTab = ref<AdminBookingTab>('active')
const pastPage = ref(1)
const creatingBooking = ref(false)
const createBookingOpen = ref(false)
const showCalendar = ref(false)
const memberSearch = ref('')
const defaultCreateDate = DateTime.now().setZone('America/Los_Angeles').toISODate() ?? ''
const createForm = reactive({
  userId: '',
  date: defaultCreateDate,
  startSlot: '',
  endSlot: '',
  notes: '',
  requestHold: false,
  burnCredits: true
})

const { data: bookingRows, refresh, pending } = await useAsyncData('admin:bookings', async () => {
  const query = statusFilter.value === 'all'
    ? {}
    : { status: statusFilter.value }
  const res = await $fetch<{ bookings: AdminBooking[] }>('/api/admin/bookings', { query })
  return res.bookings
}, { watch: [statusFilter] })

const bookings = computed(() => bookingRows.value ?? [])

const { data: memberRows, refresh: refreshMembers, pending: membersPending } = await useAsyncData('admin:bookings:members', async () => {
  const res = await $fetch<{ members: AdminMember[] }>('/api/admin/members')
  return res.members
})

const members = computed(() => memberRows.value ?? [])

const filteredMembers = computed(() => {
  const q = memberSearch.value.trim().toLowerCase()
  if (!q) return members.value
  return members.value.filter((member) => {
    const name = [member.customer_first_name, member.customer_last_name].filter(Boolean).join(' ').toLowerCase()
    const email = (member.customer_email ?? '').toLowerCase()
    return name.includes(q) || email.includes(q) || member.user_id.toLowerCase().includes(q)
  })
})

const memberItems = computed(() => filteredMembers.value.map(member => ({
  label: `${[member.customer_first_name, member.customer_last_name].filter(Boolean).join(' ') || member.customer_email || member.user_id} · ${Math.max(0, Number(member.credit_balance ?? 0))} credits`,
  value: member.user_id
})))

const selectedMember = computed(() =>
  members.value.find(member => member.user_id === createForm.userId) ?? null
)

const selectedMemberCredits = computed(() => Math.max(0, Number(selectedMember.value?.credit_balance ?? 0)))

const memberCreditWarning = computed(() => createForm.burnCredits && !!selectedMember.value && selectedMemberCredits.value <= 0)

type TimeSlotItem = {
  label: string
  value: string
  minutes: number
}

const halfHourSlotItems: TimeSlotItem[] = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const label = DateTime.fromObject({ hour, minute }, { zone: 'America/Los_Angeles' }).toFormat('h:mm a')
  return { label, value, minutes }
})

const startSlotItems = computed(() => halfHourSlotItems.slice(0, -1).map(item => ({
  label: item.label,
  value: item.value
})))

const selectedStartSlot = computed(() =>
  halfHourSlotItems.find(item => item.value === createForm.startSlot) ?? null
)

const endSlotItems = computed(() => {
  if (!selectedStartSlot.value) return []
  return halfHourSlotItems
    .filter(item => item.minutes > selectedStartSlot.value!.minutes)
    .map(item => ({
      label: item.label,
      value: item.value
    }))
})

watch(() => createForm.startSlot, (next) => {
  if (!next) {
    createForm.endSlot = ''
    return
  }

  const startSlot = halfHourSlotItems.find(item => item.value === next)
  if (!startSlot) {
    createForm.endSlot = ''
    return
  }

  const oneHourLater = startSlot.minutes + 60
  const defaultEnd = halfHourSlotItems.find(item => item.minutes >= oneHourLater)
    ?? halfHourSlotItems.find(item => item.minutes > startSlot.minutes)
    ?? null

  createForm.endSlot = defaultEnd?.value ?? ''
})

onMounted(async () => {
  await Promise.allSettled([refresh(), refreshMembers()])
})

watch(createBookingOpen, async (open) => {
  if (!open) return
  await refreshMembers()
})

const canSubmitCreateBooking = computed(() =>
  !!createForm.userId
  && !!createForm.date
  && !!createForm.startSlot
  && !!createForm.endSlot
  && !creatingBooking.value
)

function parseBookingTime(value: string | null | undefined) {
  if (!value) return null
  const parsedIso = DateTime.fromISO(value, { setZone: true })
  if (parsedIso.isValid) return parsedIso
  const parsedSql = DateTime.fromSQL(value, { zone: 'utc' })
  if (parsedSql.isValid) return parsedSql
  return null
}

function bookingEndsAtMillis(booking: AdminBooking) {
  const parsed = parseBookingTime(booking.end_time)
  if (parsed?.isValid) return parsed.toMillis()
  const fallback = new Date(booking.end_time).getTime()
  return Number.isFinite(fallback) ? fallback : Number.NaN
}

function bookingStartsAtMillis(booking: AdminBooking) {
  const parsed = parseBookingTime(booking.start_time)
  if (parsed?.isValid) return parsed.toMillis()
  const fallback = new Date(booking.start_time).getTime()
  return Number.isFinite(fallback) ? fallback : Number.NaN
}

const activeBookings = computed(() =>
  bookings.value
    .filter((booking) => {
      if (booking.status === 'canceled') return false
      const endMillis = bookingEndsAtMillis(booking)
      return Number.isFinite(endMillis) ? endMillis >= Date.now() : true
    })
    .sort((a, b) => bookingStartsAtMillis(a) - bookingStartsAtMillis(b))
)
const activeHoldBookings = computed(() =>
  activeBookings.value.filter(booking => hasHold(booking))
)
const pastBookings = computed(() =>
  bookings.value
    .filter((booking) => {
      if (booking.status === 'canceled') return true
      const endMillis = bookingEndsAtMillis(booking)
      return Number.isFinite(endMillis) ? endMillis < Date.now() : false
    })
    .sort((a, b) => bookingStartsAtMillis(b) - bookingStartsAtMillis(a))
)
const pastTotalPages = computed(() => Math.max(1, Math.ceil(pastBookings.value.length / PAST_BOOKINGS_PAGE_SIZE)))
const paginatedPastBookings = computed(() => {
  const page = Math.min(Math.max(1, pastPage.value), pastTotalPages.value)
  const start = (page - 1) * PAST_BOOKINGS_PAGE_SIZE
  return pastBookings.value.slice(start, start + PAST_BOOKINGS_PAGE_SIZE)
})

watch([statusFilter, bookingTab], () => {
  pastPage.value = 1
})

watch(pastTotalPages, (value) => {
  if (pastPage.value > value) pastPage.value = value
})

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function bookingLabel(booking: AdminBooking) {
  if (booking.is_guest) return booking.guest_name || booking.guest_email || 'Guest booking'
  return booking.member_name || booking.member_email || booking.user_id || 'Member booking'
}

function bookingDateKey(booking: AdminBooking) {
  const parsed = parseBookingTime(booking.start_time)
  if (!parsed?.isValid) return 'unknown'
  return parsed.setZone('America/Los_Angeles').toFormat('yyyy-LL-dd')
}

function formatBookingDateHeading(key: string) {
  if (key === 'unknown') return 'Unknown date'
  const parsed = DateTime.fromFormat(key, 'yyyy-LL-dd', { zone: 'America/Los_Angeles' })
  if (!parsed.isValid) return key
  return parsed.toFormat('cccc, LLL d, yyyy')
}

function groupBookingsByDate(source: AdminBooking[], order: 'asc' | 'desc'): BookingGroup[] {
  const byDate = new Map<string, AdminBooking[]>()
  for (const booking of source) {
    const key = bookingDateKey(booking)
    const list = byDate.get(key)
    if (list) list.push(booking)
    else byDate.set(key, [booking])
  }

  const groups = Array.from(byDate.entries()).map(([key, items]) => ({
    key,
    label: formatBookingDateHeading(key),
    items: [...items].sort((a, b) => bookingStartsAtMillis(a) - bookingStartsAtMillis(b))
  }))

  groups.sort((left, right) => {
    if (left.key === 'unknown') return 1
    if (right.key === 'unknown') return -1

    const leftDay = DateTime.fromFormat(left.key, 'yyyy-LL-dd', { zone: 'America/Los_Angeles' })
    const rightDay = DateTime.fromFormat(right.key, 'yyyy-LL-dd', { zone: 'America/Los_Angeles' })
    if (!leftDay.isValid || !rightDay.isValid) return left.key.localeCompare(right.key)

    return order === 'asc'
      ? leftDay.toMillis() - rightDay.toMillis()
      : rightDay.toMillis() - leftDay.toMillis()
  })

  return groups
}

const activeBookingGroups = computed(() => groupBookingsByDate(activeBookings.value, 'asc'))
const activeHoldBookingGroups = computed(() => groupBookingsByDate(activeHoldBookings.value, 'asc'))
const pastBookingGroups = computed(() => groupBookingsByDate(paginatedPastBookings.value, 'desc'))
const visibleBookingGroups = computed(() => {
  if (bookingTab.value === 'active') return activeBookingGroups.value
  if (bookingTab.value === 'holds') return activeHoldBookingGroups.value
  return pastBookingGroups.value
})

function formatDate(value: string) {
  const parsed = parseBookingTime(value)
  if (!parsed?.isValid) return value
  return parsed.setZone('America/Los_Angeles').toJSDate().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function hasHold(booking: AdminBooking) {
  return (booking.booking_holds?.length ?? 0) > 0
}

function holdRangeLabel(booking: AdminBooking) {
  const hold = booking.booking_holds?.[0]
  if (!hold) return null
  return `${formatDate(hold.hold_start)} → ${formatDate(hold.hold_end)} (LA)`
}

const {
  reschedulingId,
  rescheduleOpen,
  rescheduleForm,
  rescheduleSummaryLabel,
  rescheduleHintsLoading,
  rescheduleHintsError,
  rescheduleMonthCells,
  rescheduleMonthLabel,
  selectedDayStartOptions,
  selectedDayEndOptions,
  selectedDayFitWindows,
  selectedDayFitWindowsLabel,
  rescheduleDurationMinutes,
  holdEligibility,
  holdMinEndLabel,
  holdEndLabel,
  canGoToPrevMonth,
  canGoToNextMonth,
  openReschedule,
  closeReschedule,
  onRescheduleStartChange,
  onRescheduleEndChange,
  applyRescheduleDay,
  goToPrevRescheduleMonth,
  goToNextRescheduleMonth,
  saveReschedule
} = useAdminBookingReschedule({
  onSaved: async () => {
    await refresh()
  }
})

function openRescheduleModal(booking: AdminBookingForReschedule) {
  openReschedule(booking)
}

async function cancelBooking(bookingId: string) {
  cancelingId.value = bookingId
  try {
    const res = await $fetch<{ refundedCredits: number }>('/api/admin/bookings/cancel', {
      method: 'POST',
      body: {
        bookingId,
        refundCredits: refundCredits.value
      }
    })

    const description = res.refundedCredits > 0
      ? `${res.refundedCredits} credits refunded.`
      : 'Booking canceled.'

    toast.add({
      title: 'Booking canceled',
      description
    })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not cancel booking',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    cancelingId.value = null
  }
}

function goToPastPage(page: number) {
  pastPage.value = Math.min(Math.max(1, page), pastTotalPages.value)
}

function toIsoFromDateAndSlot(dateValue: string, timeValue: string) {
  if (!dateValue.trim() || !timeValue.trim()) return null
  const dt = DateTime.fromISO(`${dateValue}T${timeValue}`, { zone: 'America/Los_Angeles' })
  if (!dt.isValid) return null
  return dt.toUTC().toISO()
}

function resetCreateForm(options?: { keepMember?: boolean }) {
  if (!options?.keepMember) createForm.userId = ''
  createForm.date = defaultCreateDate
  createForm.startSlot = ''
  createForm.endSlot = ''
  createForm.notes = ''
  createForm.requestHold = false
  createForm.burnCredits = true
}

async function createBookingOnBehalf() {
  const startIso = toIsoFromDateAndSlot(createForm.date, createForm.startSlot)
  const endIso = toIsoFromDateAndSlot(createForm.date, createForm.endSlot)
  if (!createForm.userId || !startIso || !endIso) {
    toast.add({
      title: 'Missing required fields',
      description: 'Select a member, date, and start/end time slots.',
      color: 'warning'
    })
    return
  }

  creatingBooking.value = true
  try {
    const res = await $fetch<AdminCreateBookingResponse>('/api/admin/bookings/create', {
      method: 'POST',
      body: {
        userId: createForm.userId,
        startTime: startIso,
        endTime: endIso,
        notes: createForm.notes.trim() || null,
        requestHold: createForm.requestHold,
        burnCredits: createForm.burnCredits
      }
    })

    const burned = Number(res.burned ?? 0)
    const holdMessage = res.holdId ? ' Hold attached.' : ''
    const burnMessage = res.burnCredits
      ? `${burned} credits burned.${res.newBalance !== null ? ` New balance: ${res.newBalance}.` : ''}`
      : 'Credits were not burned.'

    toast.add({
      title: 'Booking created',
      description: `${burnMessage}${holdMessage}`
    })

    createBookingOpen.value = false
    resetCreateForm({ keepMember: true })
    await Promise.allSettled([refresh(), refreshMembers()])
  } catch (error: unknown) {
    const message = readErrorMessage(error)
    toast.add({
      title: 'Could not create booking',
      description: message,
      color: message.toLowerCase().includes('insufficient') || message.toLowerCase().includes('no available credits')
        ? 'warning'
        : 'error'
    })
  } finally {
    creatingBooking.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <UDashboardPanel
      id="admin-bookings"
      class="min-h-0 flex-1 admin-ops-panel"
      :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
    >
      <template #header>
        <UDashboardNavbar
          title="Bookings"
          class="admin-ops-navbar"
          :ui="{ root: 'border-b-0', right: 'gap-2' }"
        >
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <UButton
              size="sm"
              color="primary"
              variant="soft"
              icon="i-lucide-plus"
              @click="createBookingOpen = true"
            >
              Create booking
            </UButton>
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
          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-calendar-range"
            title="Booking operations"
            description="Review all member and guest bookings. Use admin cancel/reschedule when manual intervention is needed, or create bookings directly on behalf of members."
          />

          <UCard>
            <div class="flex flex-wrap items-center gap-3">
              <UFormField label="Status filter">
                <USelect
                  v-model="statusFilter"
                  class="min-w-44"
                  :items="[
                    { label: 'All', value: 'all' },
                    { label: 'Confirmed', value: 'confirmed' },
                    { label: 'Requested', value: 'requested' },
                    { label: 'Canceled', value: 'canceled' }
                  ]"
                />
              </UFormField>
              <UCheckbox
                v-model="refundCredits"
                label="Refund credits on cancel"
              />
            </div>
          </UCard>

          <div class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                size="sm"
                :variant="bookingTab === 'active' ? 'solid' : 'soft'"
                :color="bookingTab === 'active' ? 'primary' : 'neutral'"
                @click="bookingTab = 'active'"
              >
                Active bookings
              </UButton>
              <UButton
                size="sm"
                :variant="bookingTab === 'holds' ? 'solid' : 'soft'"
                :color="bookingTab === 'holds' ? 'primary' : 'neutral'"
                @click="bookingTab = 'holds'"
              >
                Active holds
              </UButton>
              <UButton
                size="sm"
                :variant="bookingTab === 'past' ? 'solid' : 'soft'"
                :color="bookingTab === 'past' ? 'primary' : 'neutral'"
                @click="bookingTab = 'past'"
              >
                Past bookings
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                :icon="showCalendar ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                @click="showCalendar = !showCalendar"
              >
                {{ showCalendar ? 'Hide calendar' : 'Show calendar' }}
              </UButton>
            </div>

            <UCard
              v-if="showCalendar"
              class="admin-panel-card border-0"
            >
              <div class="space-y-3">
                <div>
                  <p class="text-sm font-medium">
                    Live calendar reference
                  </p>
                  <p class="text-xs text-dimmed">
                    Full schedule view for context while reviewing, editing, and creating bookings.
                  </p>
                </div>
                <AvailabilityCalendar
                  endpoint="/api/calendar/public"
                  :full-day="true"
                />
              </div>
            </UCard>
            <UCard
              v-else
              class="admin-panel-card border-0"
            >
              <div class="text-sm text-dimmed">
                Calendar hidden. Use <span class="font-medium text-highlighted">Show calendar</span> for full schedule context.
              </div>
            </UCard>

            <UCard>
              <div class="text-sm font-medium">
                Bookings by date
              </div>
            </UCard>

            <div
              v-if="bookingTab === 'active' && !activeBookings.length"
              class="rounded-lg border border-default p-3 text-sm text-dimmed"
            >
              No active bookings.
            </div>

            <div
              v-else-if="bookingTab === 'holds' && !activeHoldBookings.length"
              class="rounded-lg border border-default p-3 text-sm text-dimmed"
            >
              No active holds.
            </div>

            <div
              v-else-if="bookingTab === 'past' && !pastBookings.length"
              class="rounded-lg border border-default p-3 text-sm text-dimmed"
            >
              No past bookings.
            </div>

            <div
              v-else
              class="space-y-3"
            >
              <div
                v-for="group in visibleBookingGroups"
                :key="`${bookingTab}-${group.key}`"
                class="space-y-3"
              >
                <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                  {{ group.label }}
                </p>

                <UCard
                  v-for="booking in group.items"
                  :key="`${booking.id}-${bookingTab}`"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <div class="font-medium truncate">
                          {{ bookingLabel(booking) }}
                        </div>
                        <UBadge
                          :color="booking.status === 'confirmed' ? 'success' : booking.status === 'requested' ? 'warning' : 'neutral'"
                          size="xs"
                          variant="soft"
                        >
                          {{ booking.status }}
                        </UBadge>
                        <UBadge
                          :color="booking.is_guest ? 'neutral' : 'primary'"
                          size="xs"
                          variant="soft"
                        >
                          {{ booking.is_guest ? 'guest' : 'member' }}
                        </UBadge>
                        <UBadge
                          v-if="bookingTab === 'holds' || hasHold(booking)"
                          color="warning"
                          size="xs"
                          variant="soft"
                        >
                          hold
                        </UBadge>
                      </div>
                      <div class="mt-1 text-sm text-dimmed">
                        {{ formatDate(booking.start_time) }} → {{ formatDate(booking.end_time) }} (LA)
                      </div>
                      <div
                        v-if="hasHold(booking)"
                        class="mt-1 text-xs text-dimmed"
                      >
                        Hold: {{ holdRangeLabel(booking) }}
                      </div>
                      <div class="mt-1 text-xs text-dimmed">
                        Credits burned: {{ booking.credits_burned ?? 0 }} · Created {{ formatDate(booking.created_at) }}
                      </div>
                      <div
                        v-if="booking.notes"
                        class="mt-2 text-xs text-dimmed"
                      >
                        {{ booking.notes }}
                      </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                      <UButton
                        v-if="bookingTab !== 'past'"
                        color="neutral"
                        variant="soft"
                        size="sm"
                        @click="openRescheduleModal(booking as AdminBookingForReschedule)"
                      >
                        Edit time
                      </UButton>
                      <UButton
                        v-if="bookingTab !== 'past'"
                        color="error"
                        variant="soft"
                        size="sm"
                        :loading="cancelingId === booking.id"
                        :disabled="booking.status === 'canceled'"
                        @click="cancelBooking(booking.id)"
                      >
                        Cancel booking
                      </UButton>
                    </div>
                  </div>
                </UCard>
              </div>
            </div>

            <div
              v-if="bookingTab === 'past' && pastBookings.length > 0"
              class="flex items-center justify-between gap-2"
            >
              <p class="text-xs text-dimmed">
                Page {{ pastPage }} of {{ pastTotalPages }}
              </p>
              <div class="flex items-center gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  :disabled="pastPage <= 1"
                  @click="goToPastPage(pastPage - 1)"
                >
                  Previous
                </UButton>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  :disabled="pastPage >= pastTotalPages"
                  @click="goToPastPage(pastPage + 1)"
                >
                  Next
                </UButton>
              </div>
            </div>
          </div>
        </AdminOpsShell>
      </template>
    </UDashboardPanel>

    <UModal v-model:open="createBookingOpen">
      <template #content>
        <UCard
          class="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-h-[calc(100dvh-4rem)]"
          :ui="{ body: 'min-h-0 overflow-y-scroll' }"
        >
          <template #header>
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold">
                  Create booking
                </h3>
                <p class="mt-1 text-xs text-dimmed">
                  Create a booking on behalf of a member using 30-minute increments.
                </p>
              </div>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-refresh-cw"
                :loading="membersPending"
                @click="() => refreshMembers()"
              />
            </div>
          </template>

          <div class="space-y-4 pr-1">
            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Find member">
                <UInput
                  v-model="memberSearch"
                  placeholder="Search by name or email"
                />
              </UFormField>

              <UFormField label="Member">
                <USelect
                  v-model="createForm.userId"
                  class="w-full"
                  :items="memberItems"
                  placeholder="Select a member"
                />
              </UFormField>

              <UFormField label="Date (local)">
                <UInput
                  v-model="createForm.date"
                  type="date"
                />
              </UFormField>

              <UFormField label="Start time (30-min)">
                <USelect
                  v-model="createForm.startSlot"
                  :items="startSlotItems"
                  placeholder="Select start time"
                />
              </UFormField>

              <UFormField label="End time (30-min)">
                <USelect
                  v-model="createForm.endSlot"
                  :items="endSlotItems"
                  :disabled="!createForm.startSlot || !endSlotItems.length"
                  placeholder="Select end time"
                />
              </UFormField>
            </div>

            <div
              v-if="selectedMember"
              class="flex flex-wrap items-center gap-2 text-xs text-dimmed"
            >
              <UBadge
                size="xs"
                variant="soft"
                :color="selectedMember.effective_status === 'active' ? 'success' : 'warning'"
              >
                {{ selectedMember.effective_status }}
              </UBadge>
              <span>{{ selectedMember.customer_email || selectedMember.user_id }}</span>
              <span>·</span>
              <span>{{ selectedMemberCredits }} credits available</span>
              <span v-if="selectedMember.tier">· {{ selectedMember.tier }}</span>
            </div>

            <UAlert
              v-if="memberCreditWarning"
              color="warning"
              variant="soft"
              icon="i-lucide-wallet-cards"
              title="No credits available"
              description="This member has no available credits to burn. Disable credit burn or add credits first."
            />

            <UFormField label="Notes">
              <UTextarea
                v-model="createForm.notes"
                placeholder="Optional booking notes"
                :rows="2"
              />
            </UFormField>

            <div class="flex flex-wrap items-center gap-3">
              <UCheckbox
                v-model="createForm.burnCredits"
                label="Burn member credits"
              />
              <UCheckbox
                v-model="createForm.requestHold"
                label="Request overnight hold"
              />
            </div>
          </div>

          <template #footer>
            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="creatingBooking"
                @click="createBookingOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                color="primary"
                :loading="creatingBooking"
                :disabled="!canSubmitCreateBooking"
                @click="createBookingOnBehalf"
              >
                Create booking
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <AdminRescheduleModal
      v-model:open="rescheduleOpen"
      :loading="Boolean(reschedulingId)"
      :form="rescheduleForm"
      :summary-label="rescheduleSummaryLabel"
      :month-label="rescheduleMonthLabel"
      :hints-loading="rescheduleHintsLoading"
      :hints-error="rescheduleHintsError"
      :month-cells="rescheduleMonthCells"
      :start-options="selectedDayStartOptions"
      :end-options="selectedDayEndOptions"
      :fit-windows="selectedDayFitWindows"
      :fit-windows-label="selectedDayFitWindowsLabel"
      :duration-minutes="rescheduleDurationMinutes"
      :hold-eligibility="holdEligibility"
      :hold-min-end-label="holdMinEndLabel"
      :hold-end-label="holdEndLabel"
      :can-go-prev-month="canGoToPrevMonth"
      :can-go-next-month="canGoToNextMonth"
      @close="closeReschedule"
      @apply-day="applyRescheduleDay"
      @start-change="onRescheduleStartChange"
      @end-change="onRescheduleEndChange"
      @prev-month="goToPrevRescheduleMonth"
      @next-month="goToNextRescheduleMonth"
      @save="saveReschedule"
    />
  </div>
</template>
