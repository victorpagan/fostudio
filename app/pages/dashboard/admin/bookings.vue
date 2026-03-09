<script setup lang="ts">
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
}

const toast = useToast()
const statusFilter = ref<string>('all')
const refundCredits = ref(true)
const cancelingId = ref<string | null>(null)
const reschedulingId = ref<string | null>(null)

const rescheduleForm = reactive({
  bookingId: '' as string,
  startTime: '',
  endTime: '',
  notes: '' as string
})

const { data: bookingRows, refresh, pending } = await useAsyncData('admin:bookings', async () => {
  const query = statusFilter.value === 'all'
    ? {}
    : { status: statusFilter.value }
  const res = await $fetch<{ bookings: AdminBooking[] }>('/api/admin/bookings', { query })
  return res.bookings
}, { watch: [statusFilter] })

const bookings = computed(() => bookingRows.value ?? [])

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
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
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

function openReschedule(booking: AdminBooking) {
  rescheduleForm.bookingId = booking.id
  rescheduleForm.startTime = booking.start_time
  rescheduleForm.endTime = booking.end_time
  rescheduleForm.notes = booking.notes ?? ''
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
        notes: rescheduleForm.notes || null
      }
    })
    toast.add({ title: 'Booking rescheduled' })
    await refresh()
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

        <div class="space-y-3">
          <UCard v-for="booking in bookings" :key="booking.id">
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
                </div>
                <div class="mt-1 text-sm text-dimmed">
                  {{ formatDate(booking.start_time) }} → {{ formatDate(booking.end_time) }} (LA)
                </div>
                <div class="mt-1 text-xs text-dimmed">
                  Credits burned: {{ booking.credits_burned ?? 0 }} · Created {{ formatDate(booking.created_at) }}
                </div>
                <div v-if="booking.notes" class="mt-2 text-xs text-dimmed">
                  {{ booking.notes }}
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <UButton color="neutral" variant="soft" size="sm" @click="openReschedule(booking)">
                  Edit time
                </UButton>
                <UButton
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

        <UCard v-if="rescheduleForm.bookingId">
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="font-medium">
                Adjust booking time
              </div>
              <div class="text-sm text-dimmed">
                Rescheduling does not auto-recalculate burned credits. Use member credit adjustments when needed.
              </div>
            </div>
            <UButton color="neutral" variant="soft" @click="rescheduleForm.bookingId = ''">
              Close
            </UButton>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-3">
            <UFormField label="Start">
              <UInput
                :model-value="toLocalInputValue(rescheduleForm.startTime)"
                type="datetime-local"
                @update:model-value="(value) => { rescheduleForm.startTime = String(value ?? '') }"
              />
            </UFormField>
            <UFormField label="End">
              <UInput
                :model-value="toLocalInputValue(rescheduleForm.endTime)"
                type="datetime-local"
                @update:model-value="(value) => { rescheduleForm.endTime = String(value ?? '') }"
              />
            </UFormField>
            <UFormField label="Notes">
              <UInput v-model="rescheduleForm.notes" placeholder="Optional update notes" />
            </UFormField>
          </div>
          <div class="mt-4">
            <UButton :loading="reschedulingId === rescheduleForm.bookingId" @click="saveReschedule">
              Save new time
            </UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
