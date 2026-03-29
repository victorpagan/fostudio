<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type CalendarSettings = {
  peakDays: number[]
  peakStartHour: number
  peakEndHour: number
  guestPeakMultiplier: number
  guestBookingRatePerCreditCents: number
  guestBookingWindowDays: number
  guestBookingStartHour: number
  guestBookingEndHour: number
  memberRescheduleNoticeHours: number
}

type PeakDayOption = {
  label: string
  value: number
}

type CalendarBlock = {
  id: string
  start_time: string
  end_time: string
  reason: string | null
  active: boolean
}

const toast = useToast()
const savingSettings = ref(false)
const savingBlock = ref(false)
const deletingBlockId = ref<string | null>(null)

const calendarSettings = reactive<CalendarSettings>({
  peakDays: [1, 2, 3, 4],
  peakStartHour: 11,
  peakEndHour: 16,
  guestPeakMultiplier: 2,
  guestBookingRatePerCreditCents: 3500,
  guestBookingWindowDays: 7,
  guestBookingStartHour: 11,
  guestBookingEndHour: 19,
  memberRescheduleNoticeHours: 24
})

const blockForm = reactive({
  id: '' as string,
  startTime: '',
  endTime: '',
  reason: '',
  active: true
})

const peakDayItems: PeakDayOption[] = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 }
]

const selectedPeakDays = computed<PeakDayOption[]>({
  get() {
    return peakDayItems.filter(item => calendarSettings.peakDays.includes(item.value))
  },
  set(value) {
    calendarSettings.peakDays = (value ?? []).map(item => item.value)
  }
})

const guestBookingRatePerCreditDollars = computed<number>({
  get() {
    const cents = Number(calendarSettings.guestBookingRatePerCreditCents ?? 0)
    if (!Number.isFinite(cents)) return 0
    return cents / 100
  },
  set(value) {
    const normalized = Number(value)
    if (!Number.isFinite(normalized)) return
    calendarSettings.guestBookingRatePerCreditCents = Math.max(100, Math.round(normalized * 100))
  }
})

const { pending, refresh } = await useAsyncData('admin:calendar:settings', async () => {
  const res = await $fetch<{ settings: CalendarSettings }>('/api/admin/calendar/settings')
  calendarSettings.peakDays = Array.isArray(res.settings.peakDays) ? res.settings.peakDays : [1, 2, 3, 4]
  calendarSettings.peakStartHour = Number(res.settings.peakStartHour ?? 11)
  calendarSettings.peakEndHour = Number(res.settings.peakEndHour ?? 16)
  calendarSettings.guestPeakMultiplier = Number(res.settings.guestPeakMultiplier ?? 2)
  calendarSettings.guestBookingRatePerCreditCents = Number(res.settings.guestBookingRatePerCreditCents ?? 3500)
  calendarSettings.guestBookingWindowDays = Number(res.settings.guestBookingWindowDays ?? 7)
  calendarSettings.guestBookingStartHour = Number(res.settings.guestBookingStartHour ?? 11)
  calendarSettings.guestBookingEndHour = Number(res.settings.guestBookingEndHour ?? 19)
  calendarSettings.memberRescheduleNoticeHours = Number(res.settings.memberRescheduleNoticeHours ?? 24)
  return res.settings
})

const { data: calendarBlocks, refresh: refreshBlocks } = await useAsyncData('admin:calendar:blocks', async () => {
  const res = await $fetch<{ blocks: CalendarBlock[] }>('/api/admin/calendar/blocks')
  return res.blocks
})

const blocks = computed(() => calendarBlocks.value ?? [])

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
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
        guestBookingRatePerCreditCents: calendarSettings.guestBookingRatePerCreditCents,
        guestBookingWindowDays: calendarSettings.guestBookingWindowDays,
        guestBookingStartHour: calendarSettings.guestBookingStartHour,
        guestBookingEndHour: calendarSettings.guestBookingEndHour,
        memberRescheduleNoticeHours: calendarSettings.memberRescheduleNoticeHours
      }
    })
    toast.add({ title: 'Calendar settings saved' })
    await refresh()
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
    if (!start || !end) throw new Error('Start and end times are required')
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
</script>

<template>
  <UDashboardPanel id="admin-calendar-settings">
    <template #header>
      <UDashboardNavbar title="Calendar Settings" :ui="{ right: 'gap-2' }">
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
          icon="i-lucide-calendar-clock"
          title="Calendar controls"
          description="Configure LA peak windows, guest behavior, and manage blackout windows."
        />

        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-medium">
                Booking window settings
              </div>
              <div class="text-sm text-dimmed">
                Used by booking cost previews and scheduling limits.
              </div>
            </div>
            <UButton :loading="savingSettings" @click="saveCalendarSettings">
              Save settings
            </UButton>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-4 lg:grid-cols-8">
            <UFormField label="Peak days">
              <USelectMenu v-model="selectedPeakDays" multiple :items="peakDayItems" />
            </UFormField>
            <UFormField label="Peak start hour (LA)">
              <UInput v-model.number="calendarSettings.peakStartHour" type="number" min="0" max="23" />
            </UFormField>
            <UFormField label="Peak end hour (LA)">
              <UInput v-model.number="calendarSettings.peakEndHour" type="number" min="1" max="24" />
            </UFormField>
            <UFormField label="Guest peak multiplier">
              <UInput v-model.number="calendarSettings.guestPeakMultiplier" type="number" step="0.25" min="1" />
            </UFormField>
            <UFormField label="Guest rate per credit ($)">
              <UInput v-model.number="guestBookingRatePerCreditDollars" type="number" min="1" step="0.01" />
            </UFormField>
            <UFormField label="Guest booking window (days)">
              <UInput v-model.number="calendarSettings.guestBookingWindowDays" type="number" min="1" max="60" />
            </UFormField>
            <UFormField label="Guest start hour (LA)">
              <UInput v-model.number="calendarSettings.guestBookingStartHour" type="number" min="0" max="23" />
            </UFormField>
            <UFormField label="Guest end hour (LA)">
              <UInput v-model.number="calendarSettings.guestBookingEndHour" type="number" min="1" max="24" />
            </UFormField>
            <UFormField label="Member reschedule notice (hours)">
              <UInput v-model.number="calendarSettings.memberRescheduleNoticeHours" type="number" min="1" max="240" />
            </UFormField>
          </div>
        </UCard>

        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-medium">
                Studio block-off windows
              </div>
              <div class="text-sm text-dimmed">
                Prevent bookings during maintenance, closures, or private events.
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
            <div v-for="block in blocks" :key="block.id" class="rounded-lg border border-default p-3">
              <div class="flex items-center justify-between gap-3">
                <div class="text-sm">
                  <div class="font-medium">
                    {{ block.reason || 'Studio block' }}
                  </div>
                  <div class="text-dimmed">
                    {{ formatDate(block.start_time) }} → {{ formatDate(block.end_time) }} (LA)
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge :color="block.active ? 'warning' : 'neutral'" size="xs" variant="soft">
                    {{ block.active ? 'active' : 'inactive' }}
                  </UBadge>
                  <UButton size="xs" color="neutral" variant="soft" @click="loadBlock(block)">
                    Edit
                  </UButton>
                  <UButton size="xs" color="error" variant="soft" :loading="deletingBlockId === block.id" @click="deleteBlock(block.id)">
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
      </div>
    </template>
  </UDashboardPanel>
</template>
