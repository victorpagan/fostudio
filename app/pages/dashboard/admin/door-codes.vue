<script setup lang="ts">
import { formatAdminDateTime } from '~~/app/utils/adminTime'
import ScheduledCodesPanel from '~~/app/components/dashboard/admin/access/ScheduledCodesPanel.vue'

definePageMeta({ middleware: ['admin'] })

type MemberRecord = {
  membership_id: string
  user_id: string
  customer_email: string | null
  customer_first_name: string | null
  customer_last_name: string | null
  door_code: string | null
  effective_status: string
}

type PermanentCodeRecord = {
  id: string
  label: string
  slot_number: number
  code: string
  active: boolean
  last_synced_at: string | null
  last_sync_status: 'ok' | 'error' | null
  last_sync_error: string | null
}

type DoorCodesPayload = {
  members: MemberRecord[]
  permanentCodes: PermanentCodeRecord[]
  settings: {
    permanentCodesDisarmAbodeOutsideLabHours: boolean
  }
  access: AccessStatusPayload
}

type AccessJob = {
  id: number
  job_type: string
  status: string
  booking_id: string | null
  user_id: string | null
  run_at: string
  attempts: number
  max_attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
}

type AccessIncident = {
  id: string
  incident_type: string
  severity: string
  status: string
  title: string
  message: string | null
  booking_id: string | null
  user_id: string | null
  created_at: string
  updated_at: string
}

type AccessStatusPayload = {
  provider: {
    ok: boolean
    mode: string
    state: string | null
    reason?: string | null
  }
  summary: {
    pendingJobs: number
    deadJobs: number
    openIncidents: number
  }
  deadJobs: AccessJob[]
  recentJobs: AccessJob[]
  recentIncidents: AccessIncident[]
}

type DoorCodesTab = 'members' | 'scheduled' | 'permanent' | 'jobs'

const toast = useToast()
const route = useRoute()
const router = useRouter()
const selectedMemberId = ref<string | null>(null)
const memberDoorCode = ref('')
const memberCodeSearch = ref('')
const savingMemberDoorCode = ref(false)

const savingPermanent = ref(false)
const deletingPermanentId = ref<string | null>(null)
const permanentDeleteTarget = ref<PermanentCodeRecord | null>(null)
const permanentDeleteConfirmOpen = ref(false)
const savingAccessSettings = ref(false)
const doorCodesTab = ref<DoorCodesTab>('members')
const permanentCodeSearch = ref('')
const permanentStatusFilter = ref<'all' | 'active' | 'inactive'>('all')
const permanentCodesDisarmAbodeOutsideLabHours = ref(false)
const dashboardHydrated = ref(false)
const processingAccessJobs = ref(false)
const processJobsConfirmOpen = ref(false)
const retryingJobId = ref<number | null>(null)
const retryJobTarget = ref<AccessJob | null>(null)
const retryJobConfirmOpen = ref(false)
const retryReason = ref('Manual retry after reviewing the previous provider error')
const permanentForm = reactive({
  id: '' as string,
  label: '',
  slotNumber: 90,
  code: '',
  active: true
})

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

const { data, pending, refresh, error: loadError } = await useAsyncData<DoorCodesPayload>('admin:door-codes', async () => {
  const [membersRes, permanentRes, settingsRes, accessRes] = await Promise.all([
    $fetch<{ members: MemberRecord[] }>('/api/admin/members'),
    $fetch<{ codes: PermanentCodeRecord[] }>('/api/admin/access/permanent-codes'),
    $fetch<{ settings: { permanentCodesDisarmAbodeOutsideLabHours: boolean } }>('/api/admin/access/settings'),
    $fetch<AccessStatusPayload>('/api/admin/access/status')
  ])

  return {
    members: membersRes.members ?? [],
    permanentCodes: permanentRes.codes ?? [],
    settings: {
      permanentCodesDisarmAbodeOutsideLabHours: Boolean(
        settingsRes.settings?.permanentCodesDisarmAbodeOutsideLabHours
      )
    },
    access: accessRes
  }
})

onMounted(async () => {
  dashboardHydrated.value = true
  await refresh()
})

const hasDoorCodeData = computed(() => Boolean(data.value))
const canMutate = computed(() => dashboardHydrated.value && hasDoorCodeData.value && !pending.value && !loadError.value)
const members = computed(() => data.value?.members ?? [])
const permanentCodes = computed(() => data.value?.permanentCodes ?? [])
const accessStatus = computed(() => data.value?.access ?? null)
const recentAccessJobs = computed(() => {
  const rows = [...(accessStatus.value?.deadJobs ?? []), ...(accessStatus.value?.recentJobs ?? [])]
  return Array.from(new Map(rows.map(row => [row.id, row] as const)).values())
})
const recentAccessIncidents = computed(() => accessStatus.value?.recentIncidents ?? [])
const routeMemberId = computed(() => readQueryValue(route.query.accountId))
const routePermanentId = computed(() => readQueryValue(route.query.permanentId))
const memberMobileDetailOpen = computed(() => Boolean(routeMemberId.value))
const permanentMobileDetailOpen = computed(() => Boolean(routePermanentId.value))
const filteredMemberCodes = computed(() => {
  const query = memberCodeSearch.value.trim().toLowerCase()
  if (!query) return members.value

  return members.value.filter((member) => {
    const text = [
      memberLabel(member),
      member.customer_email,
      member.user_id,
      member.effective_status,
      member.door_code
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return text.includes(query)
  })
})
const filteredPermanentCodes = computed(() => {
  const query = permanentCodeSearch.value.trim().toLowerCase()
  return permanentCodes.value.filter((row) => {
    if (permanentStatusFilter.value === 'active' && !row.active) return false
    if (permanentStatusFilter.value === 'inactive' && row.active) return false
    if (!query) return true

    const text = [
      row.label,
      String(row.slot_number),
      row.code,
      row.last_sync_status,
      row.last_sync_error
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return text.includes(query)
  })
})
const initialPermanentCodesDisarmOutsideLabHours = computed(() =>
  Boolean(data.value?.settings?.permanentCodesDisarmAbodeOutsideLabHours)
)
const accessSettingsDirty = computed(() =>
  permanentCodesDisarmAbodeOutsideLabHours.value !== initialPermanentCodesDisarmOutsideLabHours.value
)

const selectedMember = computed(() =>
  members.value.find(row => row.membership_id === selectedMemberId.value) ?? null
)

function memberLabel(member: MemberRecord) {
  const name = [member.customer_first_name, member.customer_last_name].filter(Boolean).join(' ')
  return name || member.customer_email || member.user_id
}

function memberStatusColor(status: string) {
  const normalized = String(status ?? '').toLowerCase()
  return normalized === 'active' || normalized === 'past_due' ? 'success' : 'neutral'
}

watch(members, (next) => {
  if (!next.length) return
  if (!selectedMemberId.value) {
    selectedMemberId.value = next[0]!.membership_id
    memberDoorCode.value = next[0]!.door_code ?? ''
    return
  }

  const current = next.find(row => row.membership_id === selectedMemberId.value)
  if (!current) {
    selectedMemberId.value = next[0]!.membership_id
    memberDoorCode.value = next[0]!.door_code ?? ''
    return
  }

  memberDoorCode.value = current.door_code ?? ''
}, { immediate: true })

watch(filteredMemberCodes, (next) => {
  if (!next.length) {
    selectedMemberId.value = null
    return
  }

  if (selectedMemberId.value && next.some(member => member.membership_id === selectedMemberId.value)) {
    return
  }

  const target = next[0]!
  selectedMemberId.value = target.membership_id
  memberDoorCode.value = target.door_code ?? ''
}, { immediate: true })

watch(initialPermanentCodesDisarmOutsideLabHours, (next) => {
  permanentCodesDisarmAbodeOutsideLabHours.value = next
}, { immediate: true })

watch([routeMemberId, members], ([memberId]) => {
  if (!memberId) return
  const target = members.value.find(row => row.membership_id === memberId)
  if (!target) return
  selectedMemberId.value = target.membership_id
  memberDoorCode.value = target.door_code ?? ''
}, { immediate: true })

watch([routePermanentId, permanentCodes], ([permanentId]) => {
  if (!permanentId || permanentId === 'new') return
  const target = permanentCodes.value.find(row => row.id === permanentId)
  if (target) editPermanentCode(target, { syncRoute: false })
}, { immediate: true })

watch(() => route.query.accessTab, (value) => {
  if (value === 'scheduled' || value === 'permanent' || value === 'jobs') doorCodesTab.value = value
  else if (value === 'members') doorCodesTab.value = 'members'
}, { immediate: true })

function readQueryValue(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.trim())
    if (typeof first === 'string') return first.trim()
  }
  return null
}

function setDoorCodesTab(tab: DoorCodesTab) {
  doorCodesTab.value = tab
  void router.replace({
    path: route.path,
    query: {
      ...route.query,
      accessTab: tab,
      accountId: tab === 'members' ? route.query.accountId : undefined,
      permanentId: tab === 'permanent' ? route.query.permanentId : undefined,
      scheduledId: tab === 'scheduled' ? route.query.scheduledId : undefined
    }
  })
}

function selectMember(member: MemberRecord) {
  selectedMemberId.value = member.membership_id
  memberDoorCode.value = member.door_code ?? ''
  void router.replace({
    path: route.path,
    query: { ...route.query, accessTab: 'members', accountId: member.membership_id, permanentId: undefined }
  })
}

function closeMemberDetail() {
  void router.replace({
    path: route.path,
    query: { ...route.query, accountId: undefined }
  })
}

function closePermanentDetail() {
  void router.replace({
    path: route.path,
    query: { ...route.query, permanentId: undefined }
  })
}

function resetPermanentForm() {
  permanentForm.id = ''
  permanentForm.label = ''
  permanentForm.slotNumber = 90
  permanentForm.code = ''
  permanentForm.active = true
}

function editPermanentCode(row: PermanentCodeRecord, options: { syncRoute?: boolean } = {}) {
  permanentForm.id = row.id
  permanentForm.label = row.label
  permanentForm.slotNumber = Number(row.slot_number)
  permanentForm.code = row.code
  permanentForm.active = Boolean(row.active)
  if (options.syncRoute !== false) {
    void router.replace({
      path: route.path,
      query: { ...route.query, accessTab: 'permanent', permanentId: row.id, accountId: undefined }
    })
  }
}

function startPermanentCode() {
  resetPermanentForm()
  void router.replace({
    path: route.path,
    query: { ...route.query, accessTab: 'permanent', permanentId: 'new', accountId: undefined }
  })
}

async function saveMemberDoorCode() {
  if (!selectedMember.value || savingMemberDoorCode.value || !canMutate.value) return
  savingMemberDoorCode.value = true
  try {
    await $fetch('/api/admin/members/door-code-set', {
      method: 'POST',
      body: {
        userId: selectedMember.value.user_id,
        doorCode: String(memberDoorCode.value ?? '').trim()
      }
    })
    toast.add({ title: 'Account door code updated' })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not update account door code',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingMemberDoorCode.value = false
  }
}

async function savePermanentCode() {
  if (savingPermanent.value || !canMutate.value) return
  savingPermanent.value = true
  try {
    const res = await $fetch<{
      code: PermanentCodeRecord
      syncOk: boolean
      syncError: string | null
    }>('/api/admin/access/permanent-codes.upsert', {
      method: 'POST',
      body: {
        id: permanentForm.id || undefined,
        label: permanentForm.label,
        slotNumber: Number(permanentForm.slotNumber),
        code: String(permanentForm.code ?? '').trim(),
        active: Boolean(permanentForm.active)
      }
    })

    if (res.syncOk) {
      toast.add({ title: 'Permanent door code saved' })
    } else {
      toast.add({
        title: 'Permanent code saved, but lock sync failed',
        description: res.syncError ?? 'Unknown sync error',
        color: 'warning'
      })
    }

    resetPermanentForm()
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save permanent code',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingPermanent.value = false
  }
}

function requestDeletePermanentCode(row: PermanentCodeRecord) {
  permanentDeleteTarget.value = row
  permanentDeleteConfirmOpen.value = true
}

async function deletePermanentCode() {
  const target = permanentDeleteTarget.value
  if (!target || deletingPermanentId.value || !canMutate.value) return
  deletingPermanentId.value = target.id
  try {
    await $fetch('/api/admin/access/permanent-codes.delete', {
      method: 'POST',
      body: { id: target.id }
    })
    toast.add({ title: 'Permanent code removed' })
    if (permanentForm.id === target.id) resetPermanentForm()
    permanentDeleteConfirmOpen.value = false
    permanentDeleteTarget.value = null
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not remove permanent code',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    deletingPermanentId.value = null
  }
}

async function saveAccessSettings() {
  if (savingAccessSettings.value || !canMutate.value) return
  savingAccessSettings.value = true
  try {
    await $fetch('/api/admin/access/settings.upsert', {
      method: 'POST',
      body: {
        permanentCodesDisarmAbodeOutsideLabHours: permanentCodesDisarmAbodeOutsideLabHours.value
      }
    })
    toast.add({ title: 'Access settings saved' })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save access settings',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingAccessSettings.value = false
  }
}

async function processDueAccessJobs() {
  if (processingAccessJobs.value || !canMutate.value) return
  processingAccessJobs.value = true
  try {
    const response = await $fetch<{
      result: { enabled?: boolean, processed?: number, succeeded?: number, failed?: number, dead?: number }
    }>('/api/admin/access/process', {
      method: 'POST',
      body: { limit: 100 }
    })
    const result = response.result
    toast.add({
      title: result.enabled === false ? 'Access automation is disabled' : 'Access jobs processed',
      description: `Processed ${Number(result.processed ?? 0)}. Succeeded ${Number(result.succeeded ?? 0)}, failed ${Number(result.failed ?? 0)}, dead ${Number(result.dead ?? 0)}.`,
      color: result.enabled === false || Number(result.failed ?? 0) > 0 ? 'warning' : 'success'
    })
    processJobsConfirmOpen.value = false
    await refresh()
  } catch (error: unknown) {
    toast.add({ title: 'Could not process access jobs', description: readErrorMessage(error), color: 'error' })
  } finally {
    processingAccessJobs.value = false
  }
}

function requestRetryAccessJob(job: AccessJob) {
  retryJobTarget.value = job
  retryReason.value = 'Manual retry after reviewing the previous provider error'
  retryJobConfirmOpen.value = true
}

async function retryAccessJob() {
  const target = retryJobTarget.value
  if (!target || retryingJobId.value || !canMutate.value || retryReason.value.trim().length < 3) return
  retryingJobId.value = target.id
  try {
    await $fetch('/api/admin/access/jobs.retry', {
      method: 'POST',
      body: { jobId: target.id, reason: retryReason.value.trim() }
    })
    const response = await $fetch<{
      result: { enabled?: boolean, processed?: number, succeeded?: number, failed?: number, dead?: number }
    }>('/api/admin/access/process', {
      method: 'POST',
      body: { limit: 100 }
    })
    const result = response.result
    toast.add({
      title: 'Access job retry completed',
      description: `Processed ${Number(result.processed ?? 0)}. Succeeded ${Number(result.succeeded ?? 0)}, failed ${Number(result.failed ?? 0)}.`,
      color: Number(result.failed ?? 0) > 0 || result.enabled === false ? 'warning' : 'success'
    })
    retryJobConfirmOpen.value = false
    retryJobTarget.value = null
    await refresh()
  } catch (error: unknown) {
    toast.add({ title: 'Could not retry access job', description: readErrorMessage(error), color: 'error' })
  } finally {
    retryingJobId.value = null
  }
}

function formatDateTime(value: string | null) {
  return formatAdminDateTime(value)
}
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-door-codes"
    title="Door Codes"
    :busy="pending"
  >
    <template #right>
      <DashboardActionGroup
        align="end"
        :secondary="[
          {
            label: 'Refresh',
            icon: 'i-lucide-refresh-cw',
            loading: pending,
            onSelect: () => refresh()
          }
        ]"
      />
    </template>

    <DashboardSectionState
      v-if="pending && !hasDoorCodeData"
      state="loading"
      title="Loading access controls"
      description="Fetching account codes, permanent codes, settings, and queue health."
    />
    <DashboardSectionState
      v-else-if="loadError && !hasDoorCodeData"
      state="error"
      title="Access controls unavailable"
      :description="readErrorMessage(loadError)"
      show-retry
      @retry="refresh"
    />
    <DashboardSectionState
      v-else-if="loadError"
      state="error"
      color="warning"
      icon="i-lucide-clock-alert"
      title="Showing stale access data"
      :description="`${readErrorMessage(loadError)} Mutations are disabled until refresh succeeds.`"
      show-retry
      @retry="refresh"
    />

    <template v-if="hasDoorCodeData">
      <AppAlert
        color="warning"
        variant="soft"
        icon="i-lucide-key-round"
        title="Door code controls"
        description="Manage account codes, scheduled external guest access, permanent lock codes, and provider queue health."
      />

      <UCard>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="font-medium">
              Access automation settings
            </div>
            <p class="mt-1 text-xs text-dimmed">
              When enabled, permanent-code unlocks can trigger Abode disarm only outside lab hours (11:00 AM–7:00 PM).
            </p>
          </div>
          <div class="flex items-center gap-3">
            <USwitch
              v-model="permanentCodesDisarmAbodeOutsideLabHours"
              aria-label="Disarm Abode for permanent-code unlocks outside lab hours"
              :disabled="!canMutate"
            />
            <UButton
              size="sm"
              :disabled="!accessSettingsDirty || !canMutate"
              :loading="savingAccessSettings"
              @click="saveAccessSettings"
            >
              Save setting
            </UButton>
          </div>
        </div>
      </UCard>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          size="sm"
          :variant="doorCodesTab === 'members' ? 'solid' : 'soft'"
          :color="doorCodesTab === 'members' ? 'primary' : 'neutral'"
          :aria-pressed="doorCodesTab === 'members'"
          @click="setDoorCodesTab('members')"
        >
          Account codes
        </UButton>
        <UButton
          size="sm"
          :variant="doorCodesTab === 'scheduled' ? 'solid' : 'soft'"
          :color="doorCodesTab === 'scheduled' ? 'primary' : 'neutral'"
          :aria-pressed="doorCodesTab === 'scheduled'"
          @click="setDoorCodesTab('scheduled')"
        >
          Scheduled codes
        </UButton>
        <UButton
          size="sm"
          :variant="doorCodesTab === 'permanent' ? 'solid' : 'soft'"
          :color="doorCodesTab === 'permanent' ? 'primary' : 'neutral'"
          :aria-pressed="doorCodesTab === 'permanent'"
          @click="setDoorCodesTab('permanent')"
        >
          Permanent codes
        </UButton>
        <UButton
          size="sm"
          :variant="doorCodesTab === 'jobs' ? 'solid' : 'soft'"
          :color="doorCodesTab === 'jobs' ? 'primary' : 'neutral'"
          :aria-pressed="doorCodesTab === 'jobs'"
          @click="setDoorCodesTab('jobs')"
        >
          Access jobs
          <UBadge
            v-if="(accessStatus?.summary.deadJobs ?? 0) > 0"
            color="error"
            variant="solid"
            size="xs"
          >
            {{ accessStatus?.summary.deadJobs }}
          </UBadge>
        </UButton>
      </div>

      <div class="space-y-4">
        <DashboardDataPanel
          v-if="doorCodesTab === 'members'"
          list-title="Account door codes"
          list-description="Search member and guest accounts first, then update their assigned code."
          detail-title="Account code editor"
          detail-description="Account codes are booking-window controlled by access jobs."
          mobile-drawer
          :mobile-detail-open="memberMobileDetailOpen"
          mobile-detail-label="Account door code details"
          @close-mobile-detail="closeMemberDetail"
        >
          <template #list-controls>
            <UCard class="admin-panel-card border-0">
              <UFormField label="Search accounts">
                <UInput
                  v-model="memberCodeSearch"
                  icon="i-lucide-search"
                  placeholder="Name, email, user id, code"
                />
              </UFormField>
            </UCard>
          </template>

          <template #list>
            <DashboardSectionState
              v-if="pending && !members.length"
              state="loading"
              title="Loading account codes"
              description="Fetching account and code assignments."
            />
            <DashboardSectionState
              v-else-if="!filteredMemberCodes.length"
              state="empty"
              title="No accounts found"
              description="Try a different search query."
            />
            <div
              v-else
              class="space-y-2"
            >
              <button
                v-for="member in filteredMemberCodes"
                :key="member.membership_id"
                type="button"
                class="w-full rounded-xl border border-default bg-elevated/35 p-3 text-left transition hover:bg-elevated/55"
                :class="selectedMemberId === member.membership_id ? '!border-primary bg-elevated/70' : ''"
                :aria-current="selectedMemberId === member.membership_id ? 'true' : undefined"
                :aria-label="`Edit door code for ${memberLabel(member)}`"
                @click="selectMember(member)"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="truncate text-sm font-medium">
                    {{ memberLabel(member) }}
                  </div>
                  <UBadge
                    :color="memberStatusColor(member.effective_status)"
                    size="xs"
                    variant="soft"
                  >
                    {{ member.effective_status }}
                  </UBadge>
                </div>
                <div class="mt-1 text-xs text-dimmed truncate">
                  {{ member.customer_email || member.user_id }}
                </div>
                <div class="mt-2 text-xs font-mono text-highlighted">
                  {{ member.door_code || 'no code set' }}
                </div>
              </button>
            </div>
          </template>

          <template #detail>
            <DashboardSectionState
              v-if="!selectedMember"
              state="empty"
              title="No account selected"
              description="Select an account to update the door code."
            />
            <UCard
              v-else
              class="admin-panel-card border-0"
            >
              <div class="space-y-3">
                <div>
                  <div class="text-sm font-medium">
                    {{ memberLabel(selectedMember) }}
                  </div>
                  <div class="mt-1 text-xs text-dimmed">
                    {{ selectedMember.customer_email || selectedMember.user_id }}
                  </div>
                </div>
                <div class="grid gap-3 sm:grid-cols-[12rem_auto]">
                  <UInput
                    v-model="memberDoorCode"
                    maxlength="6"
                    inputmode="numeric"
                    placeholder="000000"
                  />
                  <UButton
                    :loading="savingMemberDoorCode"
                    :disabled="!canMutate"
                    @click="saveMemberDoorCode"
                  >
                    Save account code
                  </UButton>
                </div>
              </div>
            </UCard>
          </template>
        </DashboardDataPanel>

        <DashboardDataPanel
          v-else-if="doorCodesTab === 'permanent'"
          list-title="Permanent door codes"
          list-description="Filter and search permanent lock slots, then edit details."
          detail-title="Permanent code editor"
          detail-description="Permanent codes are programmed directly to lock slots and stay active while enabled."
          mobile-drawer
          :mobile-detail-open="permanentMobileDetailOpen"
          mobile-detail-label="Permanent door code details"
          @close-mobile-detail="closePermanentDetail"
        >
          <template #list-controls>
            <UCard class="admin-panel-card border-0">
              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Search permanent codes">
                  <UInput
                    v-model="permanentCodeSearch"
                    icon="i-lucide-search"
                    placeholder="Label, slot, code, sync status"
                  />
                </UFormField>
                <UFormField label="Status">
                  <USelect
                    v-model="permanentStatusFilter"
                    :items="[
                      { label: 'All statuses', value: 'all' },
                      { label: 'Active', value: 'active' },
                      { label: 'Inactive', value: 'inactive' }
                    ]"
                  />
                </UFormField>
              </div>
            </UCard>
          </template>

          <template #list>
            <DashboardSectionState
              v-if="!filteredPermanentCodes.length"
              state="empty"
              title="No permanent codes"
              description="No permanent codes match this filter."
            />
            <div
              v-else
              class="space-y-2"
            >
              <UCard
                v-for="row in filteredPermanentCodes"
                :key="row.id"
                class="admin-panel-card border-0"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <div class="truncate text-sm font-medium">
                        {{ row.label }}
                      </div>
                      <UBadge
                        :color="row.active ? 'success' : 'neutral'"
                        size="xs"
                        variant="soft"
                      >
                        {{ row.active ? 'active' : 'inactive' }}
                      </UBadge>
                    </div>
                    <div class="mt-1 text-xs text-dimmed">
                      Slot {{ row.slot_number }} · Code {{ row.code }}
                    </div>
                    <div class="mt-1 text-xs text-dimmed">
                      Sync: {{ row.last_sync_status ?? 'unknown' }} · {{ formatDateTime(row.last_synced_at) }}
                    </div>
                    <div
                      v-if="row.last_sync_error"
                      class="mt-1 text-xs text-error"
                    >
                      {{ row.last_sync_error }}
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      :aria-label="`Edit permanent code ${row.label}`"
                      @click="editPermanentCode(row)"
                    >
                      Edit
                    </UButton>
                    <UButton
                      size="xs"
                      color="error"
                      variant="soft"
                      :loading="deletingPermanentId === row.id"
                      :disabled="!canMutate"
                      :aria-label="`Delete permanent code ${row.label}`"
                      @click="requestDeletePermanentCode(row)"
                    >
                      Delete
                    </UButton>
                  </div>
                </div>
              </UCard>
            </div>
          </template>

          <template #detail>
            <UCard class="admin-panel-card border-0">
              <div class="space-y-3">
                <div class="text-sm font-medium">
                  {{ permanentForm.id ? 'Edit permanent code' : 'Create permanent code' }}
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <UFormField label="Label">
                    <UInput
                      v-model="permanentForm.label"
                      placeholder="Staff / Cleaner / Owner"
                    />
                  </UFormField>
                  <UFormField label="Slot">
                    <UInput
                      v-model.number="permanentForm.slotNumber"
                      type="number"
                      min="1"
                      max="99"
                    />
                  </UFormField>
                  <UFormField label="Code">
                    <UInput
                      v-model="permanentForm.code"
                      maxlength="6"
                      inputmode="numeric"
                      placeholder="000000"
                    />
                  </UFormField>
                  <UFormField label="Active">
                    <UCheckbox
                      v-model="permanentForm.active"
                      label="Enabled"
                    />
                  </UFormField>
                </div>
                <DashboardActionGroup
                  align="start"
                  :primary="{
                    label: permanentForm.id ? 'Update permanent code' : 'Create permanent code',
                    loading: savingPermanent,
                    disabled: !canMutate,
                    onSelect: savePermanentCode
                  }"
                  :secondary="[
                    {
                      label: 'New',
                      color: 'neutral',
                      variant: 'soft',
                      disabled: !canMutate,
                      onSelect: startPermanentCode
                    }
                  ]"
                />
              </div>
            </UCard>
          </template>
        </DashboardDataPanel>

        <ScheduledCodesPanel v-else-if="doorCodesTab === 'scheduled'" />

        <div
          v-else-if="doorCodesTab === 'jobs'"
          class="space-y-4"
        >
          <AppAlert
            :color="accessStatus?.provider.ok ? 'success' : 'error'"
            :variant="accessStatus?.provider.ok ? 'soft' : 'subtle'"
            :icon="accessStatus?.provider.ok ? 'i-lucide-lock-keyhole' : 'i-lucide-triangle-alert'"
            :title="accessStatus?.provider.ok ? 'Lock provider ready' : 'Lock provider degraded'"
            :description="accessStatus?.provider.ok
              ? `Home Assistant reports the lock as ${accessStatus.provider.state ?? 'available'}. Writes are verified against the physical code slot.`
              : (accessStatus?.provider.reason ?? 'The lock provider health check did not pass.')"
          />

          <div class="grid gap-3 sm:grid-cols-3">
            <UCard class="admin-panel-card border-0">
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Pending jobs
              </div>
              <div class="mt-2 text-3xl font-light">
                {{ accessStatus?.summary.pendingJobs ?? 0 }}
              </div>
            </UCard>
            <UCard class="admin-panel-card border-0">
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Dead jobs
              </div>
              <div class="mt-2 text-3xl font-light">
                {{ accessStatus?.summary.deadJobs ?? 0 }}
              </div>
            </UCard>
            <UCard class="admin-panel-card border-0">
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Open incidents
              </div>
              <div class="mt-2 text-3xl font-light">
                {{ accessStatus?.summary.openIncidents ?? 0 }}
              </div>
            </UCard>
          </div>

          <UCard class="admin-panel-card border-0">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="font-medium">
                  Queue remediation
                </div>
                <p class="mt-1 text-xs text-dimmed">
                  Process currently due jobs, or retry a reviewed dead job below. Retrying resets attempts, records the admin reason, and immediately runs the due queue.
                </p>
              </div>
              <UButton
                color="primary"
                variant="soft"
                icon="i-lucide-play"
                :loading="processingAccessJobs"
                :disabled="!canMutate"
                @click="processJobsConfirmOpen = true"
              >
                Process due jobs
              </UButton>
            </div>
          </UCard>

          <div class="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Recent access jobs
                </div>
              </template>
              <DashboardSectionState
                v-if="!recentAccessJobs.length"
                state="empty"
                title="No access jobs recorded"
                description="Queued access work will appear here."
              />
              <div
                v-else
                class="space-y-2"
              >
                <div
                  v-for="job in recentAccessJobs"
                  :key="job.id"
                  class="rounded-lg border border-default p-3"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-medium">#{{ job.id }} {{ job.job_type }}</span>
                        <UBadge
                          :color="job.status === 'dead' ? 'error' : job.status === 'pending' ? 'warning' : job.status === 'succeeded' ? 'success' : 'neutral'"
                          variant="soft"
                          size="xs"
                        >
                          {{ job.status }}
                        </UBadge>
                      </div>
                      <div class="mt-1 text-xs text-dimmed">
                        Due {{ formatDateTime(job.run_at) }} · attempts {{ job.attempts }}/{{ job.max_attempts }}
                      </div>
                      <div class="mt-1 break-all text-xs text-dimmed">
                        Booking {{ job.booking_id || 'n/a' }} · user {{ job.user_id || 'n/a' }}
                      </div>
                      <div
                        v-if="job.last_error"
                        class="mt-2 text-xs text-error"
                      >
                        {{ job.last_error }}
                      </div>
                    </div>
                    <UButton
                      v-if="job.status === 'dead'"
                      size="xs"
                      color="error"
                      variant="soft"
                      icon="i-lucide-rotate-ccw"
                      :loading="retryingJobId === job.id"
                      :disabled="!canMutate"
                      :aria-label="`Retry dead access job ${job.id}`"
                      @click="requestRetryAccessJob(job)"
                    >
                      Retry job
                    </UButton>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Recent access incidents
                </div>
              </template>
              <DashboardSectionState
                v-if="!recentAccessIncidents.length"
                state="empty"
                title="No access incidents recorded"
                description="Provider and policy failures will appear here."
              />
              <div
                v-else
                class="space-y-2"
              >
                <div
                  v-for="incident in recentAccessIncidents"
                  :key="incident.id"
                  class="rounded-lg border border-default p-3"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="font-medium text-sm">
                      {{ incident.title }}
                    </div>
                    <UBadge
                      :color="incident.severity === 'critical' ? 'error' : incident.severity === 'warning' ? 'warning' : 'neutral'"
                      variant="soft"
                      size="xs"
                    >
                      {{ incident.severity }}
                    </UBadge>
                  </div>
                  <div class="mt-1 text-xs text-dimmed">
                    {{ incident.incident_type }} · {{ incident.status }} · {{ formatDateTime(incident.created_at) }}
                  </div>
                  <div
                    v-if="incident.message"
                    class="mt-2 text-xs text-error"
                  >
                    {{ incident.message }}
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>

    <ConfirmDialog
      v-model:open="permanentDeleteConfirmOpen"
      title="Delete this permanent code?"
      :description="`Delete ${permanentDeleteTarget?.label || 'this code'} from lock slot ${permanentDeleteTarget?.slot_number ?? 'unknown'} and the database. This may remove active staff access.`"
      confirm-label="Delete permanent code"
      color="error"
      :busy="Boolean(deletingPermanentId)"
      @confirm="deletePermanentCode"
      @cancel="permanentDeleteTarget = null"
    />

    <ConfirmDialog
      v-model:open="processJobsConfirmOpen"
      title="Process due access jobs now?"
      :description="`Run up to 100 due jobs against the configured lock and alarm providers. ${accessStatus?.summary.pendingJobs ?? 0} jobs are currently pending.`"
      confirm-label="Process due jobs"
      color="warning"
      :busy="processingAccessJobs"
      @confirm="processDueAccessJobs"
    />

    <ConfirmDialog
      v-model:open="retryJobConfirmOpen"
      :title="`Retry access job #${retryJobTarget?.id ?? ''}?`"
      :description="`This resets the dead job's attempt count and immediately runs the due queue. Prior error: ${retryJobTarget?.last_error || 'not recorded'}`"
      confirm-label="Retry and process"
      color="warning"
      :busy="Boolean(retryingJobId)"
      :disabled="retryReason.trim().length < 3"
      @confirm="retryAccessJob"
      @cancel="retryJobTarget = null"
    >
      <UFormField
        label="Retry reason"
        description="Stored with the job payload for the admin audit."
        required
      >
        <UTextarea
          v-model="retryReason"
          :rows="3"
        />
      </UFormField>
    </ConfirmDialog>
  </DashboardPageScaffold>
</template>
