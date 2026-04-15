<script setup lang="ts">
import { DateTime } from 'luxon'
import type { AdminBookingForReschedule } from '~~/app/composables/booking/reschedule/useAdminBookingReschedule'
import { useAdminBookingReschedule } from '~~/app/composables/booking/reschedule/useAdminBookingReschedule'
import AdminRescheduleModal from '~~/app/components/booking/reschedule/modal/AdminRescheduleModal.vue'
import AvailabilityCalendar from '~~/app/components/AvailabilityCalendar.vue'

definePageMeta({ middleware: ['admin'] })

type AdminBooking = {
  id: string
  source_type?: 'booking' | 'external'
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
  external_provider?: string | null
  external_location?: string | null
  external_calendar_id?: string | null
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

type CalendarBlock = {
  id: string
  start_time: string
  end_time: string
  reason: string | null
  active: boolean
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
const bookingSearch = ref('')
const refundCredits = ref(true)
const cancelingId = ref<string | null>(null)
const bookingTab = ref<AdminBookingTab>('active')
const pastPage = ref(1)
const creatingBooking = ref(false)
const createBookingOpen = ref(false)
const blockOffOpen = ref(false)
const showCalendar = ref(false)
const memberSearch = ref('')
const savingBlock = ref(false)
const deletingBlockId = ref<string | null>(null)
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
const blockForm = reactive({
  id: '',
  date: defaultCreateDate,
  startSlot: '',
  endSlot: '',
  notes: ''
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

const { data: blockRows, refresh: refreshBlocks, pending: blocksPending } = await useAsyncData('admin:bookings:blocks', async () => {
  const res = await $fetch<{ blocks: CalendarBlock[] }>('/api/admin/calendar/blocks', {
    query: { activeOnly: true }
  })
  return res.blocks
})

const members = computed(() => memberRows.value ?? [])
const blocks = computed(() => blockRows.value ?? [])
const sortedBlocks = computed(() => [...blocks.value].sort((left, right) => {
  return bookingStartsAtMillis(left) - bookingStartsAtMillis(right)
}))

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

const selectedBlockStartSlot = computed(() =>
  halfHourSlotItems.find(item => item.value === blockForm.startSlot) ?? null
)

const blockEndSlotItems = computed(() => {
  if (!selectedBlockStartSlot.value) return []
  return halfHourSlotItems
    .filter(item => item.minutes > selectedBlockStartSlot.value!.minutes)
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

watch(() => blockForm.startSlot, (next) => {
  if (!next) {
    blockForm.endSlot = ''
    return
  }

  const startSlot = halfHourSlotItems.find(item => item.value === next)
  if (!startSlot) {
    blockForm.endSlot = ''
    return
  }

  const oneHourLater = startSlot.minutes + 60
  const defaultEnd = halfHourSlotItems.find(item => item.minutes >= oneHourLater)
    ?? halfHourSlotItems.find(item => item.minutes > startSlot.minutes)
    ?? null

  blockForm.endSlot = defaultEnd?.value ?? ''
})

onMounted(async () => {
  await Promise.allSettled([refresh(), refreshMembers(), refreshBlocks()])
})

watch(createBookingOpen, async (open) => {
  if (!open) return
  await refreshMembers()
})

watch(blockOffOpen, async (open) => {
  if (!open) return
  await refreshBlocks()
})

const canSubmitCreateBooking = computed(() =>
  !!createForm.userId
  && !!createForm.date
  && !!createForm.startSlot
  && !!createForm.endSlot
  && !creatingBooking.value
)

const canSubmitBlockWindow = computed(() =>
  !!blockForm.date
  && !!blockForm.startSlot
  && !!blockForm.endSlot
  && !savingBlock.value
)

function parseBookingTime(value: string | null | undefined) {
  if (!value) return null
  const parsedIso = DateTime.fromISO(value, { setZone: true })
  if (parsedIso.isValid) return parsedIso
  const parsedSql = DateTime.fromSQL(value, { zone: 'utc' })
  if (parsedSql.isValid) return parsedSql
  return null
}

function bookingEndsAtMillis(value: { end_time: string }) {
  const parsed = parseBookingTime(value.end_time)
  if (parsed?.isValid) return parsed.toMillis()
  const fallback = new Date(value.end_time).getTime()
  return Number.isFinite(fallback) ? fallback : Number.NaN
}

function bookingStartsAtMillis(value: { start_time: string }) {
  const parsed = parseBookingTime(value.start_time)
  if (parsed?.isValid) return parsed.toMillis()
  const fallback = new Date(value.start_time).getTime()
  return Number.isFinite(fallback) ? fallback : Number.NaN
}

function isExternalBooking(booking: AdminBooking) {
  return booking.source_type === 'external' || booking.status === 'external'
}

function isReadOnlyBooking(booking: AdminBooking) {
  return isExternalBooking(booking)
}

const activeBookings = computed(() =>
  bookings.value
    .filter((booking) => {
      if (!isExternalBooking(booking) && booking.status === 'canceled') return false
      const endMillis = bookingEndsAtMillis(booking)
      return Number.isFinite(endMillis) ? endMillis >= Date.now() : true
    })
    .sort((a, b) => bookingStartsAtMillis(a) - bookingStartsAtMillis(b))
)
const activeHoldBookings = computed(() =>
  activeBookings.value.filter(booking => !isExternalBooking(booking) && hasHold(booking))
)
const pastBookings = computed(() =>
  bookings.value
    .filter((booking) => {
      if (!isExternalBooking(booking) && booking.status === 'canceled') return true
      const endMillis = bookingEndsAtMillis(booking)
      return Number.isFinite(endMillis) ? endMillis < Date.now() : false
    })
    .sort((a, b) => bookingStartsAtMillis(b) - bookingStartsAtMillis(a))
)
const filteredActiveBookings = computed(() => activeBookings.value.filter(booking => bookingMatchesSearch(booking)))
const filteredActiveHoldBookings = computed(() => activeHoldBookings.value.filter(booking => bookingMatchesSearch(booking)))
const filteredPastBookings = computed(() => pastBookings.value.filter(booking => bookingMatchesSearch(booking)))

const pastTotalPages = computed(() => Math.max(1, Math.ceil(filteredPastBookings.value.length / PAST_BOOKINGS_PAGE_SIZE)))
const paginatedPastBookings = computed(() => {
  const page = Math.min(Math.max(1, pastPage.value), pastTotalPages.value)
  const start = (page - 1) * PAST_BOOKINGS_PAGE_SIZE
  return filteredPastBookings.value.slice(start, start + PAST_BOOKINGS_PAGE_SIZE)
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
  if (isExternalBooking(booking)) return booking.guest_name || 'External booking'
  if (booking.is_guest) return booking.guest_name || booking.guest_email || 'Guest booking'
  return booking.member_name || booking.member_email || booking.user_id || 'Member booking'
}

function bookingStatusColor(booking: AdminBooking) {
  if (isExternalBooking(booking)) return 'info'
  if (booking.status === 'confirmed') return 'success'
  if (booking.status === 'requested') return 'warning'
  return 'neutral'
}

function bookingTypeColor(booking: AdminBooking) {
  if (isExternalBooking(booking)) return 'info'
  return booking.is_guest ? 'neutral' : 'primary'
}

function bookingTypeLabel(booking: AdminBooking) {
  if (isExternalBooking(booking)) return 'external'
  return booking.is_guest ? 'guest' : 'member'
}

function externalMetaLabel(booking: AdminBooking) {
  if (!isExternalBooking(booking)) return null
  const provider = String(booking.external_provider ?? '').trim()
  const location = String(booking.external_location ?? '').trim()
  const calendarId = String(booking.external_calendar_id ?? '').trim()
  const parts = [provider, location, calendarId ? `calendar ${calendarId}` : ''].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Google Calendar'
}

function bookingMatchesSearch(booking: AdminBooking) {
  const query = bookingSearch.value.trim().toLowerCase()
  if (!query) return true

  const haystack = [
    bookingLabel(booking),
    booking.status,
    booking.member_name,
    booking.member_email,
    booking.guest_name,
    booking.guest_email,
    booking.notes,
    externalMetaLabel(booking),
    formatDate(booking.start_time),
    formatDate(booking.end_time)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
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

const activeBookingGroups = computed(() => groupBookingsByDate(filteredActiveBookings.value, 'asc'))
const activeHoldBookingGroups = computed(() => groupBookingsByDate(filteredActiveHoldBookings.value, 'asc'))
const pastBookingGroups = computed(() => groupBookingsByDate(paginatedPastBookings.value, 'desc'))
const visibleBookingGroups = computed(() => {
  if (bookingTab.value === 'active') return activeBookingGroups.value
  if (bookingTab.value === 'holds') return activeHoldBookingGroups.value
  return pastBookingGroups.value
})

function toggleCalendarVisibility() {
  showCalendar.value = !showCalendar.value
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

function resetBlockForm() {
  blockForm.id = ''
  blockForm.date = defaultCreateDate
  blockForm.startSlot = ''
  blockForm.endSlot = ''
  blockForm.notes = ''
}

function loadBlockForm(block: CalendarBlock) {
  const start = parseBookingTime(block.start_time)?.setZone('America/Los_Angeles')
  const end = parseBookingTime(block.end_time)?.setZone('America/Los_Angeles')
  const startSlot = start?.isValid ? start.toFormat('HH:mm') : ''
  const endSlot = end?.isValid ? end.toFormat('HH:mm') : ''
  const hasStartSlot = halfHourSlotItems.some(item => item.value === startSlot)
  const hasEndSlot = halfHourSlotItems.some(item => item.value === endSlot)

  blockForm.id = block.id
  blockForm.date = start?.isValid ? (start.toISODate() ?? defaultCreateDate) : defaultCreateDate
  blockForm.startSlot = hasStartSlot ? startSlot : ''
  blockForm.endSlot = hasEndSlot ? endSlot : ''
  blockForm.notes = block.reason ?? ''
}

async function openBlockWindowFromCalendar(payload: {
  blockId: string
  start: string
  end: string
  notes?: string
}) {
  await refreshBlocks()

  const existingBlock = blocks.value.find(block => block.id === payload.blockId) ?? null
  if (existingBlock) {
    loadBlockForm(existingBlock)
    blockOffOpen.value = true
    return
  }

  const start = parseBookingTime(payload.start)?.setZone('America/Los_Angeles')
  const end = parseBookingTime(payload.end)?.setZone('America/Los_Angeles')
  const startSlot = start?.isValid ? start.toFormat('HH:mm') : ''
  const endSlot = end?.isValid ? end.toFormat('HH:mm') : ''
  const hasStartSlot = halfHourSlotItems.some(item => item.value === startSlot)
  const hasEndSlot = halfHourSlotItems.some(item => item.value === endSlot)

  blockForm.id = payload.blockId
  blockForm.date = start?.isValid ? (start.toISODate() ?? defaultCreateDate) : defaultCreateDate
  blockForm.startSlot = hasStartSlot ? startSlot : ''
  blockForm.endSlot = hasEndSlot ? endSlot : ''
  blockForm.notes = String(payload.notes ?? '').trim()
  blockOffOpen.value = true
}

async function saveBlockWindow() {
  const startIso = toIsoFromDateAndSlot(blockForm.date, blockForm.startSlot)
  const endIso = toIsoFromDateAndSlot(blockForm.date, blockForm.endSlot)
  if (!startIso || !endIso) {
    toast.add({
      title: 'Missing required fields',
      description: 'Select a date plus start and end slots for this block-off window.',
      color: 'warning'
    })
    return
  }

  savingBlock.value = true
  try {
    await $fetch('/api/admin/calendar/blocks.upsert', {
      method: 'POST',
      body: {
        id: blockForm.id || undefined,
        startTime: startIso,
        endTime: endIso,
        reason: blockForm.notes.trim() || null,
        active: true
      }
    })

    toast.add({
      title: blockForm.id ? 'Block-off window updated' : 'Block-off window created'
    })

    resetBlockForm()
    await refreshBlocks()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save block-off window',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingBlock.value = false
  }
}

async function deleteBlockWindow(blockId: string) {
  deletingBlockId.value = blockId
  try {
    await $fetch('/api/admin/calendar/blocks.delete', {
      method: 'POST',
      body: { id: blockId }
    })
    toast.add({ title: 'Block-off window removed' })
    if (blockForm.id === blockId) resetBlockForm()
    await refreshBlocks()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not delete block-off window',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    deletingBlockId.value = null
  }
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
    <DashboardPageScaffold
      panel-id="admin-bookings"
      title="Bookings"
    >
      <template #right>
        <DashboardActionGroup
          :primary="{
            label: 'Create booking',
            icon: 'i-lucide-plus',
            color: 'primary',
            variant: 'soft',
            onSelect: () => { createBookingOpen = true }
          }"
          :secondary="[
            {
              label: 'Studio block-off',
              icon: 'i-lucide-calendar-minus',
              color: 'neutral',
              variant: 'soft',
              onSelect: () => { blockOffOpen = true }
            },
            {
              label: 'Refresh',
              icon: 'i-lucide-refresh-cw',
              color: 'neutral',
              variant: 'soft',
              loading: pending,
              onSelect: () => refresh()
            }
          ]"
        />
      </template>

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
        </div>

        <DashboardDataPanel
          list-title="Bookings by date"
          list-description="Search first, then review grouped bookings and take action."
          detail-title="Calendar reference"
          detail-description="Live schedule context for admin actions."
          list-width-class="xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
        >
          <template #list-controls>
            <UCard class="admin-panel-card border-0">
              <div class="flex flex-wrap items-end gap-3">
                <UFormField
                  label="Search bookings"
                  class="min-w-[15rem] grow"
                >
                  <UInput
                    v-model="bookingSearch"
                    placeholder="Search name, email, notes, date"
                    icon="i-lucide-search"
                  />
                </UFormField>
              </div>
            </UCard>
          </template>

          <template #list>
            <DashboardSectionState
              v-if="bookingTab === 'active' && !filteredActiveBookings.length"
              state="empty"
              title="No active bookings"
              description="Try changing the status filter or search query."
            />
            <DashboardSectionState
              v-else-if="bookingTab === 'holds' && !filteredActiveHoldBookings.length"
              state="empty"
              title="No active holds"
              description="No hold bookings match this filter."
            />
            <DashboardSectionState
              v-else-if="bookingTab === 'past' && !filteredPastBookings.length"
              state="empty"
              title="No past bookings"
              description="No historical bookings match this filter."
            />

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
                  :class="isExternalBooking(booking) ? 'admin-booking-card-external' : ''"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <div class="font-medium truncate">
                          {{ bookingLabel(booking) }}
                        </div>
                        <UBadge
                          :color="bookingStatusColor(booking)"
                          size="xs"
                          variant="soft"
                        >
                          {{ booking.status }}
                        </UBadge>
                        <UBadge
                          :color="bookingTypeColor(booking)"
                          size="xs"
                          variant="soft"
                        >
                          {{ bookingTypeLabel(booking) }}
                        </UBadge>
                        <UBadge
                          v-if="!isReadOnlyBooking(booking) && (bookingTab === 'holds' || hasHold(booking))"
                          color="warning"
                          size="xs"
                          variant="soft"
                        >
                          hold
                        </UBadge>
                        <UBadge
                          v-if="isReadOnlyBooking(booking)"
                          color="neutral"
                          size="xs"
                          variant="soft"
                        >
                          read only
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
                      <div
                        v-if="isReadOnlyBooking(booking)"
                        class="mt-1 text-xs text-[color:var(--ui-info)]"
                      >
                        External source: {{ externalMetaLabel(booking) }}
                      </div>
                      <div
                        v-else
                        class="mt-1 text-xs text-dimmed"
                      >
                        Credits burned: {{ booking.credits_burned ?? 0 }} · Created {{ formatDate(booking.created_at) }}
                      </div>
                      <div
                        v-if="booking.notes"
                        class="mt-2 text-xs"
                        :class="isReadOnlyBooking(booking) ? 'text-[color:var(--ui-info)]' : 'text-dimmed'"
                      >
                        {{ booking.notes }}
                      </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                      <UButton
                        v-if="bookingTab !== 'past' && !isReadOnlyBooking(booking)"
                        color="neutral"
                        variant="soft"
                        size="sm"
                        @click="openRescheduleModal(booking as AdminBookingForReschedule)"
                      >
                        Edit time
                      </UButton>
                      <UButton
                        v-if="bookingTab !== 'past' && !isReadOnlyBooking(booking)"
                        color="error"
                        variant="soft"
                        size="sm"
                        :loading="cancelingId === booking.id"
                        :disabled="booking.status === 'canceled'"
                        @click="cancelBooking(booking.id)"
                      >
                        Cancel booking
                      </UButton>
                      <UButton
                        v-if="bookingTab !== 'past' && isReadOnlyBooking(booking)"
                        color="neutral"
                        variant="soft"
                        size="sm"
                        disabled
                      >
                        Read only
                      </UButton>
                    </div>
                  </div>
                </UCard>
              </div>

              <div
                v-if="bookingTab === 'past' && filteredPastBookings.length > 0"
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
          </template>

          <template #detail>
            <UCard class="admin-panel-card border-0">
              <div class="space-y-3">
                <DashboardActionGroup
                  :secondary="[
                    {
                      label: showCalendar ? 'Hide calendar' : 'Show calendar',
                      icon: showCalendar ? 'i-lucide-eye-off' : 'i-lucide-eye',
                      onSelect: toggleCalendarVisibility
                    }
                  ]"
                  align="start"
                />
                <AvailabilityCalendar
                  v-if="showCalendar"
                  endpoint="/api/admin/calendar/bookings"
                  :full-day="true"
                  :admin-view="true"
                  @block-click="(payload) => { void openBlockWindowFromCalendar(payload) }"
                />
                <DashboardSectionState
                  v-else
                  state="empty"
                  title="Calendar hidden"
                  description="Enable live calendar to compare list entries against the schedule."
                />
              </div>
            </UCard>
          </template>
        </DashboardDataPanel>
      </div>
    </DashboardPageScaffold>

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

    <UModal v-model:open="blockOffOpen">
      <template #content>
        <UCard
          class="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-h-[calc(100dvh-4rem)]"
          :ui="{ body: 'min-h-0 overflow-y-scroll' }"
        >
          <template #header>
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold">
                  Studio block-off windows
                </h3>
                <p class="mt-1 text-xs text-dimmed">
                  Create admin-only studio block-offs using the same date/time slot flow as create booking.
                </p>
              </div>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-refresh-cw"
                :loading="blocksPending"
                @click="() => refreshBlocks()"
              />
            </div>
          </template>

          <div class="space-y-4 pr-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <UAlert
                color="warning"
                variant="soft"
                icon="i-lucide-calendar-x"
                title="Blocked windows"
                description="These windows prevent new bookings and reschedules during the selected range."
              />
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-plus"
                @click="resetBlockForm"
              >
                New block window
              </UButton>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Date (local)">
                <UInput
                  v-model="blockForm.date"
                  type="date"
                />
              </UFormField>

              <UFormField label="Start time (30-min)">
                <USelect
                  v-model="blockForm.startSlot"
                  :items="startSlotItems"
                  placeholder="Select start time"
                />
              </UFormField>

              <UFormField label="End time (30-min)">
                <USelect
                  v-model="blockForm.endSlot"
                  :items="blockEndSlotItems"
                  :disabled="!blockForm.startSlot || !blockEndSlotItems.length"
                  placeholder="Select end time"
                />
              </UFormField>
            </div>

            <UFormField label="Note">
              <UTextarea
                v-model="blockForm.notes"
                placeholder="Optional note (maintenance, private booking, etc.)"
                :rows="2"
              />
            </UFormField>

            <div class="space-y-2">
              <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                Existing block-off windows
              </div>
              <DashboardSectionState
                v-if="!sortedBlocks.length"
                state="empty"
                title="No block-off windows"
                description="Create your first block window using date and time slots."
              />
              <div
                v-for="block in sortedBlocks"
                :key="block.id"
                class="rounded-lg border border-default px-3 py-2"
              >
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-sm font-medium">
                      {{ block.reason || 'Studio block-off' }}
                    </div>
                    <div class="mt-0.5 text-xs text-dimmed">
                      {{ formatDate(block.start_time) }} → {{ formatDate(block.end_time) }} (LA)
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      @click="loadBlockForm(block)"
                    >
                      Edit
                    </UButton>
                    <UButton
                      size="xs"
                      color="error"
                      variant="soft"
                      :loading="deletingBlockId === block.id"
                      @click="deleteBlockWindow(block.id)"
                    >
                      Delete
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="savingBlock"
                @click="blockOffOpen = false"
              >
                Close
              </UButton>
              <UButton
                color="warning"
                :loading="savingBlock"
                :disabled="!canSubmitBlockWindow"
                @click="saveBlockWindow"
              >
                {{ blockForm.id ? 'Update block window' : 'Create block window' }}
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
      @notes-change="(value) => { rescheduleForm.notes = value }"
      @keep-hold-change="(value) => { rescheduleForm.keepHold = value }"
      @prev-month="goToPrevRescheduleMonth"
      @next-month="goToNextRescheduleMonth"
      @save="saveReschedule"
    />
  </div>
</template>

<style scoped>
.admin-booking-card-external {
  border: 1px solid color-mix(in srgb, var(--ui-info) 45%, var(--ui-border) 55%) !important;
  background: color-mix(in srgb, var(--ui-info) 12%, transparent) !important;
}
</style>
