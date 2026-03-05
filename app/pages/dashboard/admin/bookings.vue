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

type CalendarSettings = {
  peakDays: number[]
  peakStartHour: number
  peakEndHour: number
  guestPeakMultiplier: number
  guestBookingWindowDays: number
}

type CalendarBlock = {
  id: string
  start_time: string
  end_time: string
  reason: string | null
  active: boolean
}

const toast = useToast()
const statusFilter = ref<string>('all')
const refundCredits = ref(true)
const cancelingId = ref<string | null>(null)
const reschedulingId = ref<string | null>(null)
const savingSettings = ref(false)
const savingBlock = ref(false)
const deletingBlockId = ref<string | null>(null)

const calendarSettings = reactive<CalendarSettings>({
  peakDays: [1, 2, 3, 4],
  peakStartHour: 11,
  peakEndHour: 16,
  guestPeakMultiplier: 2,
  guestBookingWindowDays: 7
})

const blockForm = reactive({
  id: '' as string,
  startTime: '',
  endTime: '',
  reason: '',
  active: true
})

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
const blocks = computed(() => calendarBlocks.value ?? [])

await useAsyncData('admin:calendar:settings', async () => {
  const res = await $fetch<{ settings: CalendarSettings }>('/api/admin/calendar/settings')
  calendarSettings.peakDays = Array.isArray(res.settings.peakDays) ? res.settings.peakDays : [1, 2, 3, 4]
  calendarSettings.peakStartHour = Number(res.settings.peakStartHour ?? 11)
  calendarSettings.peakEndHour = Number(res.settings.peakEndHour ?? 16)
  calendarSettings.guestPeakMultiplier = Number(res.settings.guestPeakMultiplier ?? 2)
  calendarSettings.guestBookingWindowDays = Number(res.settings.guestBookingWindowDays ?? 7)
  return res.settings
})

const { data: calendarBlocks, refresh: refreshBlocks } = await useAsyncData('admin:calendar:blocks', async () => {
  const res = await $fetch<{ blocks: CalendarBlock[] }>('/api/admin/calendar/blocks')
  return res.blocks
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
  return new Date(value).toLocaleString()
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

function loadBlock(block: CalendarBlock) {
  blockForm.id = block.id
  blockForm.startTime = block.start_time
  blockForm.endTime = block.end_time
  blockForm.reason = block.reason ?? ''
  blockForm.active = block.active
}

function resetBlockForm() {
  blockForm.id = ''
  blockForm.startTime = ''
  blockForm.endTime = ''
  blockForm.reason = ''
  blockForm.active = true
}

function openReschedule(booking: AdminBooking) {
  rescheduleForm.bookingId = booking.id
  rescheduleForm.startTime = booking.start_time
  rescheduleForm.endTime = booking.end_time
  rescheduleForm.notes = booking.notes ?? ''
}

async function saveCalendarSettings() {
  savingSettings.value = true
  try {
    await $fetch('/api/admin/calendar/settings.upsert', {
      method: 'POST',
      body: {
        peakDays: calendarSettings.peakDays,
        peakStartHour: calendarSettings.peakStartHour,
        peakEndHour: calendarSettings.peakEndHour,
        guestPeakMultiplier: calendarSettings.guestPeakMultiplier,
        guestBookingWindowDays: calendarSettings.guestBookingWindowDays
      }
    })
    toast.add({ title: 'Calendar settings saved' })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save calendar settings',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingSettings.value = false
  }
}

async function saveBlock() {
  savingBlock.value = true
  try {
    const start = blockForm.startTime || null
    const end = blockForm.endTime || null
    if (!start || !end) {
      throw new Error('Start and end times are required')
    }
    await $fetch('/api/admin/calendar/blocks.upsert', {
      method: 'POST',
      body: {
        id: blockForm.id || undefined,
        startTime: start,
        endTime: end,
        reason: blockForm.reason.trim() || null,
        active: blockForm.active
      }
    })
    toast.add({ title: blockForm.id ? 'Block updated' : 'Block created' })
    resetBlockForm()
    await refreshBlocks()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save block',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingBlock.value = false
  }
}

async function deleteBlock(id: string) {
  deletingBlockId.value = id
  try {
    await $fetch('/api/admin/calendar/blocks.delete', {
      method: 'POST',
      body: { id }
    })
    toast.add({ title: 'Block removed' })
    if (blockForm.id === id) resetBlockForm()
    await refreshBlocks()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not delete block',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    deletingBlockId.value = null
  }
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
      <UDashboardNavbar title="Calendar & Booking Tools" :ui="{ right: 'gap-2' }">
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
          description="Review all member and guest bookings. Use admin cancel when a schedule needs manual intervention."
        />

        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-medium">Calendar settings</div>
              <div class="text-sm text-dimmed">
                Configure peak windows and guest credit behavior used by booking calculations.
              </div>
            </div>
            <UButton :loading="savingSettings" @click="saveCalendarSettings">
              Save settings
            </UButton>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-5">
            <UFormField label="Peak days">
              <USelectMenu
                v-model="calendarSettings.peakDays"
                multiple
                :items="[
                  { label: 'Mon', value: 1 },
                  { label: 'Tue', value: 2 },
                  { label: 'Wed', value: 3 },
                  { label: 'Thu', value: 4 },
                  { label: 'Fri', value: 5 },
                  { label: 'Sat', value: 6 },
                  { label: 'Sun', value: 7 }
                ]"
              />
            </UFormField>
            <UFormField label="Peak start hour">
              <UInput v-model.number="calendarSettings.peakStartHour" type="number" min="0" max="23" />
            </UFormField>
            <UFormField label="Peak end hour">
              <UInput v-model.number="calendarSettings.peakEndHour" type="number" min="1" max="24" />
            </UFormField>
            <UFormField label="Guest peak multiplier">
              <UInput v-model.number="calendarSettings.guestPeakMultiplier" type="number" step="0.25" min="1" />
            </UFormField>
            <UFormField label="Guest booking window (days)">
              <UInput v-model.number="calendarSettings.guestBookingWindowDays" type="number" min="1" max="60" />
            </UFormField>
          </div>
        </UCard>

        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-medium">Studio block-off windows</div>
              <div class="text-sm text-dimmed">
                Create temporary blackout periods for maintenance, private events, or closures.
              </div>
            </div>
            <UButton color="neutral" variant="soft" @click="resetBlockForm">
              New block
            </UButton>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-4">
            <UFormField label="Start">
              <UInput
                :model-value="toLocalInputValue(blockForm.startTime)"
                type="datetime-local"
                @update:model-value="(value) => { blockForm.startTime = fromLocalInputValue(String(value ?? '')) ?? '' }"
              />
            </UFormField>
            <UFormField label="End">
              <UInput
                :model-value="toLocalInputValue(blockForm.endTime)"
                type="datetime-local"
                @update:model-value="(value) => { blockForm.endTime = fromLocalInputValue(String(value ?? '')) ?? '' }"
              />
            </UFormField>
            <UFormField label="Reason">
              <UInput v-model="blockForm.reason" placeholder="Maintenance" />
            </UFormField>
            <div class="flex items-end gap-3">
              <UCheckbox v-model="blockForm.active" label="Active" />
              <UButton :loading="savingBlock" @click="saveBlock">
                {{ blockForm.id ? 'Update block' : 'Create block' }}
              </UButton>
            </div>
          </div>

          <div class="mt-4 space-y-2">
            <div
              v-for="block in blocks"
              :key="block.id"
              class="rounded-lg border border-default p-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="text-sm">
                  <div class="font-medium">
                    {{ block.reason || 'Studio block' }}
                  </div>
                  <div class="text-dimmed">
                    {{ formatDate(block.start_time) }} → {{ formatDate(block.end_time) }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge :color="block.active ? 'warning' : 'neutral'" size="xs" variant="soft">
                    {{ block.active ? 'active' : 'inactive' }}
                  </UBadge>
                  <UButton size="xs" color="neutral" variant="soft" @click="loadBlock(block)">
                    Edit
                  </UButton>
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    :loading="deletingBlockId === block.id"
                    @click="deleteBlock(block.id)"
                  >
                    Delete
                  </UButton>
                </div>
              </div>
            </div>
            <div v-if="!blocks.length" class="text-sm text-dimmed">
              No block-off windows configured.
            </div>
          </div>
        </UCard>

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
          <UCard
            v-for="booking in bookings"
            :key="booking.id"
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
                </div>
                <div class="mt-1 text-sm text-dimmed">
                  {{ formatDate(booking.start_time) }} → {{ formatDate(booking.end_time) }}
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
                  color="neutral"
                  variant="soft"
                  size="sm"
                  @click="openReschedule(booking)"
                >
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
              <div class="font-medium">Adjust booking time</div>
              <div class="text-sm text-dimmed">
                Rescheduling does not auto-recalculate burned credits. Use member credit adjustment tools if needed.
              </div>
            </div>
            <UButton
              color="neutral"
              variant="soft"
              @click="rescheduleForm.bookingId = ''"
            >
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
