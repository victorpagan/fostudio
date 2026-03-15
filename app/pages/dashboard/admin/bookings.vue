<script setup lang="ts">
import { DateTime } from 'luxon'

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

const PAST_BOOKINGS_PAGE_SIZE = 10
type AdminBookingTab = 'active' | 'holds' | 'past'

const toast = useToast()
const statusFilter = ref<string>('all')
const refundCredits = ref(true)
const cancelingId = ref<string | null>(null)
const reschedulingId = ref<string | null>(null)
const bookingTab = ref<AdminBookingTab>('active')
const pastPage = ref(1)
const rescheduleOpen = ref(false)

const rescheduleForm = reactive({
  bookingId: '' as string,
  startTime: '',
  endTime: '',
  notes: '' as string,
  hadHold: false,
  keepHold: false
})

const { data: bookingRows, refresh, pending } = await useAsyncData('admin:bookings', async () => {
  const query = statusFilter.value === 'all'
    ? {}
    : { status: statusFilter.value }
  const res = await $fetch<{ bookings: AdminBooking[] }>('/api/admin/bookings', { query })
  return res.bookings
}, { watch: [statusFilter] })

const bookings = computed(() => bookingRows.value ?? [])

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

const activeBookings = computed(() =>
  bookings.value.filter((booking) => {
    if (booking.status === 'canceled') return false
    const endMillis = bookingEndsAtMillis(booking)
    return Number.isFinite(endMillis) ? endMillis >= Date.now() : true
  })
)
const activeHoldBookings = computed(() =>
  activeBookings.value.filter(booking => hasHold(booking))
)
const pastBookings = computed(() =>
  bookings.value.filter((booking) => {
    if (booking.status === 'canceled') return true
    const endMillis = bookingEndsAtMillis(booking)
    return Number.isFinite(endMillis) ? endMillis < Date.now() : false
  })
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

function toLocalInputValue(value: string | null | undefined) {
  if (!value) return ''
  const parsedIso = DateTime.fromISO(value, { setZone: true })
  if (parsedIso.isValid) return parsedIso.setZone('America/Los_Angeles').toFormat("yyyy-LL-dd'T'HH:mm")
  const parsedSql = DateTime.fromSQL(value, { zone: 'utc' })
  if (parsedSql.isValid) return parsedSql.setZone('America/Los_Angeles').toFormat("yyyy-LL-dd'T'HH:mm")
  return ''
}

function fromLocalInputValue(value: string) {
  if (!value.trim()) return null
  const dt = DateTime.fromFormat(value, "yyyy-LL-dd'T'HH:mm", { zone: 'America/Los_Angeles' })
  if (!dt.isValid) return null
  return dt.toUTC().toISO()
}

function openReschedule(booking: AdminBooking) {
  rescheduleForm.bookingId = booking.id
  rescheduleForm.startTime = toLocalInputValue(booking.start_time)
  rescheduleForm.endTime = toLocalInputValue(booking.end_time)
  rescheduleForm.notes = booking.notes ?? ''
  rescheduleForm.hadHold = hasHold(booking)
  rescheduleForm.keepHold = rescheduleForm.hadHold
  rescheduleOpen.value = true
}

function closeReschedule() {
  if (reschedulingId.value) return
  rescheduleOpen.value = false
  rescheduleForm.bookingId = ''
  rescheduleForm.startTime = ''
  rescheduleForm.endTime = ''
  rescheduleForm.notes = ''
  rescheduleForm.hadHold = false
  rescheduleForm.keepHold = false
}

async function saveReschedule() {
  if (!rescheduleForm.bookingId) return
  reschedulingId.value = rescheduleForm.bookingId
  try {
    const start = fromLocalInputValue(rescheduleForm.startTime)
    const end = fromLocalInputValue(rescheduleForm.endTime)
    if (!start || !end) throw new Error('Start and end time are required')
    await $fetch('/api/admin/bookings/reschedule', {
      method: 'POST',
      body: {
        bookingId: rescheduleForm.bookingId,
        startTime: start,
        endTime: end,
        keepHold: rescheduleForm.hadHold ? rescheduleForm.keepHold : false,
        notes: rescheduleForm.notes || null
      }
    })
    toast.add({ title: 'Booking rescheduled' })
    await refresh()
    closeReschedule()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not reschedule booking',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    reschedulingId.value = null
  }
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
</script>

<template>
  <UDashboardPanel id="admin-bookings">
    <template #header>
      <UDashboardNavbar title="Bookings" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="pending" @click="() => refresh()" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-calendar-range"
          title="Booking operations"
          description="Review all member and guest bookings. Use admin cancel and reschedule when manual intervention is needed."
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
            <UCheckbox v-model="refundCredits" label="Refund credits on cancel" />
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
          </div>

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
            <UCard
              v-for="booking in bookingTab === 'active' ? activeBookings : bookingTab === 'holds' ? activeHoldBookings : paginatedPastBookings"
              :key="`${booking.id}-${bookingTab}`"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <div class="font-medium truncate">
                      {{ bookingLabel(booking) }}
                    </div>
                    <UBadge :color="booking.status === 'confirmed' ? 'success' : booking.status === 'requested' ? 'warning' : 'neutral'" size="xs" variant="soft">
                      {{ booking.status }}
                    </UBadge>
                    <UBadge :color="booking.is_guest ? 'neutral' : 'primary'" size="xs" variant="soft">
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
                  <div v-if="booking.notes" class="mt-2 text-xs text-dimmed">
                    {{ booking.notes }}
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    v-if="bookingTab !== 'past'"
                    color="neutral"
                    variant="soft"
                    size="sm"
                    @click="openReschedule(booking)"
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

      </div>
    </template>
  </UDashboardPanel>

  <UModal
    v-model:open="rescheduleOpen"
    :dismissible="!reschedulingId"
  >
    <template #content>
      <UCard v-if="rescheduleForm.bookingId">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="font-medium">
                Adjust booking time
              </div>
              <div class="text-sm text-dimmed">
                Rescheduling does not auto-recalculate burned credits. Use member credit adjustments when needed.
              </div>
            </div>
            <UButton
              color="neutral"
              variant="soft"
              :disabled="Boolean(reschedulingId)"
              @click="closeReschedule"
            >
              Close
            </UButton>
          </div>
        </template>
        <div class="grid gap-3 md:grid-cols-3">
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
            <UFormField label="Notes">
              <UInput v-model="rescheduleForm.notes" placeholder="Optional update notes" />
            </UFormField>
          </div>
        <UAlert
          v-if="rescheduleForm.hadHold"
          class="mt-3"
          color="warning"
          variant="soft"
          icon="i-lucide-package"
          :description="rescheduleForm.keepHold ? 'This booking has a hold. Reschedule will try to keep and satisfy it by default.' : 'Hold will be removed on save, and any hold credits/tokens used for this booking will be refunded.'"
        />
        <UCheckbox
          v-if="rescheduleForm.hadHold"
          v-model="rescheduleForm.keepHold"
          class="mt-3"
          label="Keep overnight hold after reschedule"
        />
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              :disabled="Boolean(reschedulingId)"
              @click="closeReschedule"
            >
              Cancel
            </UButton>
            <UButton :loading="reschedulingId === rescheduleForm.bookingId" @click="saveReschedule">
              Save new time
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
