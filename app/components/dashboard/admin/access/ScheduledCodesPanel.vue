<script setup lang="ts">
import { DateTime } from 'luxon'
import {
  ADMIN_TIME_ZONE,
  adminDatetimeInputToIso,
  formatAdminDateTime,
  isoToAdminDatetimeInput
} from '~~/app/utils/adminTime'

type ScheduledCodeRecord = {
  id: string
  bookingId: string
  provider: 'peerspace' | 'manual'
  externalCalendarEventId: string | null
  externalReference: string | null
  manageUrl: string | null
  deliveryStatus: 'pending' | 'shared' | 'not_required'
  sharedAt: string | null
  guestName: string | null
  guestEmail: string | null
  startTime: string
  endTime: string
  bookingStatus: string
  adminNotes: string | null
  codeId: string | null
  pinCode: string | null
  codeStatus: string | null
  validFrom: string | null
  validUntil: string | null
  slotNumber: number | null
  externalEventTitle: string | null
  createdAt: string
  updatedAt: string
}

type PeerspaceEventOption = {
  id: string
  title: string | null
  guestName: string | null
  externalReference: string | null
  manageUrl: string | null
  startTime: string
  endTime: string
  linkedRecordId: string | null
  linkedBookingId: string | null
}

type ScheduledCodesPayload = {
  records: ScheduledCodeRecord[]
  eventOptions: PeerspaceEventOption[]
  settings: { autoProvisionEnabled: boolean }
  summary: { upcoming: number, needsSharing: number, activeNow: number }
}

type ScheduledFilter = 'upcoming' | 'needs_sharing' | 'active' | 'history' | 'all'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const payload = ref<ScheduledCodesPayload | null>(null)
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const syncing = ref(false)
const sharingId = ref<string | null>(null)
const revokingId = ref<string | null>(null)
const revokeTarget = ref<ScheduledCodeRecord | null>(null)
const revokeConfirmOpen = ref(false)
const search = ref('')
const statusFilter = ref<ScheduledFilter>('upcoming')

const form = reactive({
  id: '',
  provider: 'peerspace' as 'peerspace' | 'manual',
  externalCalendarEventId: '',
  guestName: '',
  guestEmail: '',
  startLocal: '',
  endLocal: '',
  externalReference: '',
  manageUrl: '',
  pinCode: '',
  notes: ''
})

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const value = error as { data?: { statusMessage?: string }, message?: string }
  return value.data?.statusMessage ?? value.message ?? 'Unknown error'
}

function resetForm() {
  const start = DateTime.now().setZone(ADMIN_TIME_ZONE).plus({ hours: 1 }).startOf('hour')
  form.id = ''
  form.provider = 'peerspace'
  form.externalCalendarEventId = ''
  form.guestName = ''
  form.guestEmail = ''
  form.startLocal = start.toFormat('yyyy-LL-dd\'T\'HH:mm')
  form.endLocal = start.plus({ hours: 4 }).toFormat('yyyy-LL-dd\'T\'HH:mm')
  form.externalReference = ''
  form.manageUrl = ''
  form.pinCode = ''
  form.notes = ''
}

resetForm()

const records = computed(() => payload.value?.records ?? [])
const eventOptions = computed(() => payload.value?.eventOptions ?? [])
const selectedRecord = computed(() => records.value.find(row => row.id === form.id) ?? null)
const eventSelectItems = computed(() => [
  { label: 'Enter reservation manually', value: '' },
  ...eventOptions.value.map(item => ({
    label: `${item.guestName || item.title || 'Peerspace booking'} · ${formatAdminDateTime(item.startTime)}`,
    value: item.id,
    disabled: Boolean(item.linkedRecordId && item.linkedRecordId !== form.id)
  }))
])

const filteredRecords = computed(() => {
  const query = search.value.trim().toLowerCase()
  const now = Date.now()

  return records.value.filter((row) => {
    const end = Date.parse(row.endTime)
    const isUpcoming = ['confirmed', 'requested'].includes(row.bookingStatus.toLowerCase()) && end > now
    const isActive = row.codeStatus === 'active'
    if (statusFilter.value === 'upcoming' && !isUpcoming) return false
    if (statusFilter.value === 'needs_sharing' && !(isUpcoming && row.deliveryStatus === 'pending')) return false
    if (statusFilter.value === 'active' && !isActive) return false
    if (statusFilter.value === 'history' && isUpcoming) return false
    if (!query) return true

    return [
      row.guestName,
      row.guestEmail,
      row.externalReference,
      row.pinCode,
      row.externalEventTitle,
      row.bookingId
    ].filter(Boolean).join(' ').toLowerCase().includes(query)
  })
})

async function loadScheduledCodes() {
  loading.value = true
  loadError.value = ''
  try {
    payload.value = await $fetch<ScheduledCodesPayload>('/api/admin/access/scheduled-codes')
    const requestedId = typeof route.query.scheduledId === 'string' ? route.query.scheduledId : ''
    if (requestedId && requestedId !== 'new') {
      const target = payload.value.records.find(row => row.id === requestedId)
      if (target) editRecord(target, false)
    }
  } catch (error) {
    loadError.value = readErrorMessage(error)
  } finally {
    loading.value = false
  }
}

function editRecord(row: ScheduledCodeRecord, syncRoute = true) {
  form.id = row.id
  form.provider = row.provider
  form.externalCalendarEventId = row.externalCalendarEventId ?? ''
  form.guestName = row.guestName ?? ''
  form.guestEmail = row.guestEmail ?? ''
  form.startLocal = isoToAdminDatetimeInput(row.startTime)
  form.endLocal = isoToAdminDatetimeInput(row.endTime)
  form.externalReference = row.externalReference ?? ''
  form.manageUrl = row.manageUrl ?? ''
  form.pinCode = row.pinCode ?? ''
  form.notes = row.adminNotes ?? ''
  if (syncRoute) {
    void router.replace({
      path: route.path,
      query: { ...route.query, accessTab: 'scheduled', scheduledId: row.id }
    })
  }
}

function startNewRecord() {
  resetForm()
  void router.replace({
    path: route.path,
    query: { ...route.query, accessTab: 'scheduled', scheduledId: 'new' }
  })
}

function applySelectedEvent(eventId: string) {
  if (!eventId) return
  const item = eventOptions.value.find(row => row.id === eventId)
  if (!item) return
  form.guestName = item.guestName ?? form.guestName
  form.startLocal = isoToAdminDatetimeInput(item.startTime)
  form.endLocal = isoToAdminDatetimeInput(item.endTime)
  form.externalReference = item.externalReference ?? form.externalReference
  form.manageUrl = item.manageUrl ?? form.manageUrl
}

async function saveRecord() {
  if (saving.value) return
  const startTime = adminDatetimeInputToIso(form.startLocal)
  const endTime = adminDatetimeInputToIso(form.endLocal)
  if (!startTime || !endTime) {
    toast.add({ title: 'Enter valid Los Angeles start and end times', color: 'error' })
    return
  }

  saving.value = true
  try {
    const result = await $fetch<{ recordId: string, pinCode: string }>('/api/admin/access/scheduled-codes.upsert', {
      method: 'POST',
      body: {
        id: form.id || undefined,
        provider: form.provider,
        externalCalendarEventId: form.externalCalendarEventId || null,
        guestName: form.guestName,
        guestEmail: form.guestEmail,
        startTime,
        endTime,
        externalReference: form.externalReference,
        manageUrl: form.manageUrl,
        pinCode: form.pinCode,
        notes: form.notes
      }
    })
    toast.add({
      title: form.id ? 'Scheduled access updated' : 'Scheduled access created',
      description: `Door code: ${result.pinCode}`,
      color: 'success'
    })
    await router.replace({
      path: route.path,
      query: { ...route.query, accessTab: 'scheduled', scheduledId: result.recordId }
    })
    await loadScheduledCodes()
  } catch (error) {
    toast.add({ title: 'Could not save scheduled access', description: readErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function copyPin(row: ScheduledCodeRecord) {
  if (!row.pinCode) return
  try {
    await navigator.clipboard.writeText(row.pinCode)
    toast.add({ title: 'Door code copied', description: row.pinCode })
  } catch {
    toast.add({ title: 'Could not copy automatically', description: `Door code: ${row.pinCode}`, color: 'warning' })
  }
}

async function setShared(row: ScheduledCodeRecord, shared: boolean) {
  if (sharingId.value) return
  sharingId.value = row.id
  try {
    await $fetch('/api/admin/access/scheduled-codes.shared', {
      method: 'POST',
      body: { id: row.id, shared }
    })
    toast.add({ title: shared ? 'Code marked shared' : 'Code marked pending' })
    await loadScheduledCodes()
  } catch (error) {
    toast.add({ title: 'Could not update sharing status', description: readErrorMessage(error), color: 'error' })
  } finally {
    sharingId.value = null
  }
}

function requestRevoke(row: ScheduledCodeRecord) {
  revokeTarget.value = row
  revokeConfirmOpen.value = true
}

async function revokeRecord() {
  const target = revokeTarget.value
  if (!target || revokingId.value) return
  revokingId.value = target.id
  try {
    await $fetch('/api/admin/access/scheduled-codes.revoke', {
      method: 'POST',
      body: { id: target.id }
    })
    toast.add({ title: 'Scheduled access revoked' })
    revokeConfirmOpen.value = false
    revokeTarget.value = null
    if (form.id === target.id) resetForm()
    await loadScheduledCodes()
  } catch (error) {
    toast.add({ title: 'Could not revoke scheduled access', description: readErrorMessage(error), color: 'error' })
  } finally {
    revokingId.value = null
  }
}

async function syncPeerspace() {
  if (syncing.value) return
  syncing.value = true
  try {
    const response = await $fetch<{
      result: { peerspaceAccess?: { created: number, updated: number, canceled: number, failed: number } | null }
    }>('/api/admin/access/scheduled-codes.sync', { method: 'POST' })
    const summary = response.result.peerspaceAccess
    toast.add({
      title: 'Peerspace calendar synchronized',
      description: summary
        ? `Created ${summary.created}, updated ${summary.updated}, canceled ${summary.canceled}, failed ${summary.failed}.`
        : 'Google Calendar synchronized; no Peerspace access changes were required.',
      color: summary?.failed ? 'warning' : 'success'
    })
    await loadScheduledCodes()
  } catch (error) {
    toast.add({ title: 'Could not synchronize Peerspace', description: readErrorMessage(error), color: 'error' })
  } finally {
    syncing.value = false
  }
}

function deliveryColor(status: ScheduledCodeRecord['deliveryStatus']) {
  if (status === 'shared') return 'success'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

function codeColor(status: string | null) {
  if (status === 'active') return 'success'
  if (status === 'scheduled') return 'primary'
  if (status === 'revoked') return 'error'
  return 'neutral'
}

watch(() => form.externalCalendarEventId, applySelectedEvent)

watch(() => route.query.scheduledId, (value) => {
  if (value === 'new') {
    resetForm()
    return
  }
  if (typeof value !== 'string') return
  const target = records.value.find(row => row.id === value)
  if (target) editRecord(target, false)
})

onMounted(loadScheduledCodes)
</script>

<template>
  <div class="space-y-4">
    <DashboardSectionState
      v-if="loading && !payload"
      state="loading"
      title="Loading scheduled access"
      description="Fetching external reservations and prepared door codes."
    />

    <DashboardSectionState
      v-else-if="loadError && !payload"
      state="error"
      title="Scheduled access is unavailable"
      :description="loadError"
      @retry="loadScheduledCodes"
    />

    <template v-else-if="payload">
      <AppAlert
        :color="payload.settings.autoProvisionEnabled ? 'primary' : 'warning'"
        variant="soft"
        icon="i-lucide-calendar-sync"
        :title="payload.settings.autoProvisionEnabled ? 'Peerspace calendar automation is enabled' : 'Peerspace calendar automation is disabled'"
        description="Confirmed Peerspace events mirrored into Google Calendar create a guest booking and temporary PIN automatically. The calendar feed does not include the guest email, so copy the PIN into the Peerspace conversation and mark it shared here."
      />

      <div class="grid gap-3 sm:grid-cols-3">
        <UCard class="admin-panel-card border-0">
          <div class="text-xs uppercase tracking-wide text-dimmed">
            Upcoming
          </div>
          <div class="mt-2 text-3xl font-light">
            {{ payload.summary.upcoming }}
          </div>
        </UCard>
        <UCard class="admin-panel-card border-0">
          <div class="text-xs uppercase tracking-wide text-dimmed">
            Needs sharing
          </div>
          <div class="mt-2 text-3xl font-light">
            {{ payload.summary.needsSharing }}
          </div>
        </UCard>
        <UCard class="admin-panel-card border-0">
          <div class="text-xs uppercase tracking-wide text-dimmed">
            Active now
          </div>
          <div class="mt-2 text-3xl font-light">
            {{ payload.summary.activeNow }}
          </div>
        </UCard>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-plus"
            @click="startNewRecord"
          >
            Add scheduled code
          </UButton>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :loading="syncing"
            @click="syncPeerspace"
          >
            Sync Peerspace calendar
          </UButton>
        </div>
        <div class="text-xs text-dimmed">
          Access runs 30 minutes before through 30 minutes after the reservation.
        </div>
      </div>

      <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <UCard class="admin-panel-card border-0">
          <template #header>
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div class="font-medium">
                  Prepared external access
                </div>
                <div class="text-xs text-dimmed">
                  Copy, share, edit, or revoke upcoming reservation PINs.
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <UInput
                  v-model="search"
                  icon="i-lucide-search"
                  placeholder="Search guest, code, confirmation"
                />
                <USelect
                  v-model="statusFilter"
                  class="w-40"
                  :items="[
                    { label: 'Upcoming', value: 'upcoming' },
                    { label: 'Needs sharing', value: 'needs_sharing' },
                    { label: 'Active now', value: 'active' },
                    { label: 'History', value: 'history' },
                    { label: 'All', value: 'all' }
                  ]"
                />
              </div>
            </div>
          </template>

          <DashboardSectionState
            v-if="!filteredRecords.length"
            state="empty"
            title="No scheduled codes match"
            description="Add a reservation manually or synchronize the Peerspace calendar."
          />

          <div
            v-else
            class="divide-y divide-default"
          >
            <div
              v-for="row in filteredRecords"
              :key="row.id"
              class="py-4 first:pt-0 last:pb-0"
            >
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      class="text-left font-medium hover:text-primary"
                      @click="editRecord(row)"
                    >
                      {{ row.guestName || 'External guest' }}
                    </button>
                    <UBadge
                      :color="deliveryColor(row.deliveryStatus)"
                      variant="soft"
                      size="xs"
                    >
                      {{ row.deliveryStatus === 'pending' ? 'needs sharing' : row.deliveryStatus.replace('_', ' ') }}
                    </UBadge>
                    <UBadge
                      :color="codeColor(row.codeStatus)"
                      variant="soft"
                      size="xs"
                    >
                      {{ row.codeStatus || 'not prepared' }}
                    </UBadge>
                  </div>
                  <div class="mt-1 text-sm text-toned">
                    {{ formatAdminDateTime(row.startTime) }}–{{ formatAdminDateTime(row.endTime) }}
                  </div>
                  <div class="mt-1 text-xs text-dimmed">
                    {{ row.provider === 'peerspace' ? 'Peerspace' : 'Manual source' }}
                    <template v-if="row.externalReference">
                      · {{ row.externalReference }}
                    </template>
                    <template v-if="row.slotNumber">
                      · lock slot {{ row.slotNumber }}
                    </template>
                  </div>
                </div>

                <div class="text-right">
                  <div class="font-mono text-2xl tracking-[0.18em]">
                    {{ row.pinCode || '------' }}
                  </div>
                  <div class="mt-2 flex flex-wrap justify-end gap-1">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      icon="i-lucide-copy"
                      :disabled="!row.pinCode"
                      @click="copyPin(row)"
                    >
                      Copy
                    </UButton>
                    <UButton
                      size="xs"
                      :color="row.deliveryStatus === 'shared' ? 'neutral' : 'success'"
                      variant="soft"
                      :loading="sharingId === row.id"
                      :disabled="row.deliveryStatus === 'not_required'"
                      @click="setShared(row, row.deliveryStatus !== 'shared')"
                    >
                      {{ row.deliveryStatus === 'shared' ? 'Mark pending' : 'Mark shared' }}
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-pencil"
                      @click="editRecord(row)"
                    >
                      Edit
                    </UButton>
                    <UButton
                      :to="`/dashboard/admin/bookings?bookingId=${encodeURIComponent(row.bookingId)}`"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-calendar-search"
                    >
                      Booking
                    </UButton>
                    <UButton
                      v-if="row.manageUrl"
                      :to="row.manageUrl"
                      target="_blank"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      icon="i-lucide-external-link"
                    >
                      Peerspace
                    </UButton>
                    <UButton
                      v-if="['confirmed', 'requested'].includes(row.bookingStatus.toLowerCase())"
                      size="xs"
                      color="error"
                      variant="ghost"
                      icon="i-lucide-ban"
                      @click="requestRevoke(row)"
                    >
                      Revoke
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <UCard class="admin-panel-card border-0 xl:sticky xl:top-4">
          <template #header>
            <div>
              <div class="font-medium">
                {{ form.id ? 'Edit scheduled access' : 'Prepare a code' }}
              </div>
              <div class="text-xs text-dimmed">
                Use a mirrored event or enter the Peerspace reservation ahead of time.
              </div>
            </div>
          </template>

          <div class="space-y-4">
            <UFormField label="Reservation source">
              <USelect
                v-model="form.provider"
                class="w-full"
                :items="[
                  { label: 'Peerspace', value: 'peerspace' },
                  { label: 'Other manual reservation', value: 'manual' }
                ]"
              />
            </UFormField>

            <UFormField
              v-if="form.provider === 'peerspace'"
              label="Mirrored Peerspace event"
              description="Optional. Selecting an event uses its exact reservation window."
            >
              <USelect
                v-model="form.externalCalendarEventId"
                class="w-full"
                :items="eventSelectItems"
              />
            </UFormField>

            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField
                label="Guest name"
                required
              >
                <UInput
                  v-model="form.guestName"
                  placeholder="Reservation name"
                />
              </UFormField>
              <UFormField
                label="Guest email"
                description="Optional; Peerspace calendar events do not provide it."
              >
                <UInput
                  v-model="form.guestEmail"
                  type="email"
                  placeholder="guest@example.com"
                />
              </UFormField>
              <UFormField
                label="Starts (Los Angeles)"
                required
              >
                <UInput
                  v-model="form.startLocal"
                  type="datetime-local"
                  :disabled="Boolean(form.externalCalendarEventId)"
                />
              </UFormField>
              <UFormField
                label="Ends (Los Angeles)"
                required
              >
                <UInput
                  v-model="form.endLocal"
                  type="datetime-local"
                  :disabled="Boolean(form.externalCalendarEventId)"
                />
              </UFormField>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Confirmation number">
                <UInput
                  v-model="form.externalReference"
                  placeholder="Peerspace reference"
                />
              </UFormField>
              <UFormField
                label="Door code"
                description="Leave blank to generate a unique six-digit PIN."
              >
                <UInput
                  v-model="form.pinCode"
                  maxlength="6"
                  inputmode="numeric"
                  placeholder="Auto-generate"
                />
              </UFormField>
            </div>

            <UFormField label="Peerspace manage URL">
              <UInput
                v-model="form.manageUrl"
                type="url"
                placeholder="https://www.peerspace.com/..."
              />
            </UFormField>

            <UFormField label="Internal notes">
              <UTextarea
                v-model="form.notes"
                :rows="3"
                placeholder="Context for studio staff"
              />
            </UFormField>

            <AppAlert
              v-if="selectedRecord?.codeStatus === 'active'"
              color="warning"
              variant="soft"
              icon="i-lucide-lock-keyhole"
              title="This PIN is active"
              description="Revoke active access before changing the reservation or code."
            />

            <DashboardActionGroup
              align="start"
              :primary="{
                label: form.id ? 'Update scheduled access' : 'Generate scheduled code',
                loading: saving,
                disabled: !form.guestName.trim() || selectedRecord?.codeStatus === 'active',
                onSelect: saveRecord
              }"
              :secondary="[
                {
                  label: 'New',
                  color: 'neutral',
                  variant: 'soft',
                  onSelect: startNewRecord
                }
              ]"
            />
          </div>
        </UCard>
      </div>
    </template>

    <ConfirmDialog
      v-model:open="revokeConfirmOpen"
      title="Revoke this scheduled code?"
      :description="`Cancel the linked guest booking and remove ${revokeTarget?.guestName || 'this guest'}'s PIN from the lock if it is active.`"
      confirm-label="Revoke access"
      color="error"
      :busy="Boolean(revokingId)"
      @confirm="revokeRecord"
      @cancel="revokeTarget = null"
    />
  </div>
</template>
