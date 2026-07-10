<script setup lang="ts">
import {
  adminDatetimeInputToIso,
  formatAdminDateTime,
  isoToAdminDatetimeInput
} from '~~/app/utils/adminTime'

definePageMeta({ middleware: ['admin'] })
const route = useRoute()
const router = useRouter()

type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'
type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed'
type IncidentCategory = 'safety' | 'facility' | 'equipment' | 'access' | 'billing' | 'member' | 'policy' | 'other'

type MemberOption = {
  userId: string
  name: string | null
  email: string | null
  label: string
  membershipStatus: string | null
  tier: string | null
}

type IncidentRow = {
  id: string
  title: string
  description: string
  category: IncidentCategory
  severity: IncidentSeverity
  status: IncidentStatus
  memberUserId: string | null
  memberLabel: string | null
  occurredAt: string | null
  resolvedAt: string | null
  resolvedBy: string | null
  closedAt: string | null
  closedBy: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  relatedExpenses: {
    linkedExpenseCount: number
    linkedExpenseTotalCents: number
    draftExpenseCount: number
    submittedExpenseCount: number
    approvedExpenseCount: number
    rejectedExpenseCount: number
    paidExpenseCount: number
  }
}

type IncidentsPayload = {
  incidents: IncidentRow[]
  summary: {
    totalCount: number
    openCount: number
    investigatingCount: number
    resolvedCount: number
    closedCount: number
    highSeverityOpenCount: number
    linkedExpenseCount: number
    linkedExpenseTotalCents: number
  }
  memberOptions: MemberOption[]
}

const toast = useToast()

const filters = reactive({
  search: '',
  status: 'all' as 'all' | IncidentStatus,
  severity: 'all' as 'all' | IncidentSeverity,
  category: 'all' as 'all' | IncidentCategory,
  memberUserId: 'all' as 'all' | string
})

const selectedIncidentId = ref<string | null>(null)
const saving = ref(false)
const updatingStatus = ref(false)
const dashboardHydrated = ref(false)
const savedFormSnapshot = ref('')
const discardConfirmOpen = ref(false)
const statusConfirmOpen = ref(false)
const pendingStatus = ref<IncidentStatus | null>(null)
let pendingDetailAction: (() => void) | null = null
let pendingCancelAction: (() => void) | null = null

const form = reactive({
  id: '' as string,
  title: '',
  description: '',
  category: 'access' as IncidentCategory,
  severity: 'medium' as IncidentSeverity,
  memberUserId: 'none' as string,
  occurredAtLocal: ''
})

const query = computed(() => {
  return {
    search: filters.search.trim() || undefined,
    status: filters.status === 'all' ? undefined : filters.status,
    severity: filters.severity === 'all' ? undefined : filters.severity,
    category: filters.category === 'all' ? undefined : filters.category,
    memberUserId: filters.memberUserId === 'all' ? undefined : filters.memberUserId
  }
})

const { data, pending, refresh, error: loadError } = await useAsyncData<IncidentsPayload>('admin:incidents', async () => {
  return await $fetch('/api/admin/incidents', { query: query.value })
}, { watch: [query] })

const hasIncidentData = computed(() => Boolean(data.value))
const canMutate = computed(() => dashboardHydrated.value && hasIncidentData.value && !pending.value && !loadError.value)
const incidents = computed(() => data.value?.incidents ?? [])
const summary = computed(() => data.value?.summary ?? {
  totalCount: 0,
  openCount: 0,
  investigatingCount: 0,
  resolvedCount: 0,
  closedCount: 0,
  highSeverityOpenCount: 0,
  linkedExpenseCount: 0,
  linkedExpenseTotalCents: 0
})
const memberOptions = computed(() => data.value?.memberOptions ?? [])

const memberSelectOptions = computed(() => [
  { label: 'All members', value: 'all' },
  ...memberOptions.value.map(option => ({ label: option.label, value: option.userId }))
])

const incidentMemberSelectOptions = computed(() => [
  { label: 'No linked member', value: 'none' },
  ...memberOptions.value.map(option => ({ label: option.label, value: option.userId }))
])

const selectedIncident = computed(() => incidents.value.find(row => row.id === selectedIncidentId.value) ?? null)
const routeIncidentId = computed(() => readQueryValue(route.query.incidentId))
const mobileDetailOpen = computed(() => Boolean(routeIncidentId.value))

function currentFormSnapshot() {
  return JSON.stringify({
    id: form.id,
    title: form.title.trim(),
    description: form.description,
    category: form.category,
    severity: form.severity,
    memberUserId: form.memberUserId,
    occurredAtLocal: form.occurredAtLocal
  })
}

const formDirty = computed(() => Boolean(savedFormSnapshot.value) && currentFormSnapshot() !== savedFormSnapshot.value)

watch(incidents, (rows) => {
  if (!rows.length) {
    selectedIncidentId.value = null
    return
  }

  if (selectedIncidentId.value && rows.some(row => row.id === selectedIncidentId.value)) return
  selectedIncidentId.value = rows[0]!.id
}, { immediate: true })

watch([() => route.query.incidentId, incidents], () => {
  const value = routeIncidentId.value

  if (!value) return
  if (value === 'new') {
    selectedIncidentId.value = null
    resetForm()
    return
  }
  if (incidents.value.some(row => row.id === value)) {
    selectedIncidentId.value = value
  }
}, { immediate: true })

watch(selectedIncident, (incident) => {
  if (!incident) {
    resetForm()
    return
  }

  form.id = incident.id
  form.title = incident.title
  form.description = incident.description ?? ''
  form.category = incident.category
  form.severity = incident.severity
  form.memberUserId = incident.memberUserId ?? 'none'
  form.occurredAtLocal = isoToAdminDatetimeInput(incident.occurredAt)
  savedFormSnapshot.value = currentFormSnapshot()
}, { immediate: true })

function resetForm() {
  form.id = ''
  form.title = ''
  form.description = ''
  form.category = 'access'
  form.severity = 'medium'
  form.memberUserId = 'none'
  form.occurredAtLocal = ''
  savedFormSnapshot.value = currentFormSnapshot()
}

function createNewIncidentDraft() {
  requestDetailAction(() => {
    selectedIncidentId.value = null
    resetForm()
    void syncIncidentRoute('new')
  })
}

function formatDateTime(value: string | null | undefined) {
  return formatAdminDateTime(value)
}

function readQueryValue(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.trim())
    if (typeof first === 'string') return first.trim()
  }
  return null
}

function syncIncidentRoute(incidentId: string | null) {
  return router.replace({
    path: route.path,
    query: {
      ...route.query,
      incidentId: incidentId || undefined
    }
  })
}

function requestDetailAction(action: () => void) {
  if (!formDirty.value) {
    action()
    return
  }

  pendingDetailAction = action
  pendingCancelAction = null
  discardConfirmOpen.value = true
}

function confirmDiscardChanges() {
  const action = pendingDetailAction
  pendingDetailAction = null
  pendingCancelAction = null
  discardConfirmOpen.value = false
  action?.()
}

function cancelDiscardChanges() {
  const action = pendingCancelAction
  pendingDetailAction = null
  pendingCancelAction = null
  action?.()
}

watch(discardConfirmOpen, (open) => {
  if (!open && pendingCancelAction) cancelDiscardChanges()
})

function selectIncident(incident: IncidentRow) {
  requestDetailAction(() => {
    selectedIncidentId.value = incident.id
    void syncIncidentRoute(incident.id)
  })
}

function closeMobileDetail() {
  requestDetailAction(() => {
    void syncIncidentRoute(null)
  })
}

function formatMoney(cents: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format((Number(cents ?? 0) || 0) / 100)
}

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function severityColor(severity: IncidentSeverity) {
  if (severity === 'critical') return 'error'
  if (severity === 'high') return 'warning'
  if (severity === 'medium') return 'neutral'
  return 'success'
}

function statusColor(status: IncidentStatus) {
  if (status === 'closed') return 'neutral'
  if (status === 'resolved') return 'success'
  if (status === 'investigating') return 'warning'
  return 'error'
}

async function saveIncident(): Promise<string | null> {
  if (saving.value || !canMutate.value) return null

  const occurredAt = adminDatetimeInputToIso(form.occurredAtLocal)
  if (form.occurredAtLocal.trim() && !occurredAt) {
    toast.add({
      title: 'Invalid incident time',
      description: 'Enter a valid Los Angeles date and time.',
      color: 'error'
    })
    return null
  }

  saving.value = true
  try {
    const payload = {
      id: form.id || undefined,
      title: form.title,
      description: form.description,
      category: form.category,
      severity: form.severity,
      memberUserId: form.memberUserId === 'none' ? null : form.memberUserId,
      occurredAt
    }

    const result = await $fetch<{ incident: { id: string } }>('/api/admin/incidents.upsert', {
      method: 'POST',
      body: payload
    })

    toast.add({ title: 'Incident report saved', color: 'success' })
    await refresh()

    const id = String(result.incident?.id ?? '').trim()
    if (id) {
      selectedIncidentId.value = id
      savedFormSnapshot.value = currentFormSnapshot()
      await syncIncidentRoute(id)
    }
    return id || null
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save incident report',
      description: readErrorMessage(error),
      color: 'error'
    })
    return null
  } finally {
    saving.value = false
  }
}

async function updateIncidentStatus(status: IncidentStatus) {
  if (!canMutate.value || updatingStatus.value) return

  let id = form.id || selectedIncidentId.value
  if (!id) return

  if (formDirty.value) {
    const savedId = await saveIncident()
    if (!savedId) return
    id = savedId
  }

  updatingStatus.value = true
  try {
    await $fetch('/api/admin/incidents.status', {
      method: 'POST',
      body: { id, status }
    })

    toast.add({ title: `Incident moved to ${status}`, color: 'success' })
    await refresh()
    selectedIncidentId.value = id
  } catch (error: unknown) {
    toast.add({
      title: 'Could not update incident status',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    updatingStatus.value = false
  }
}

function requestIncidentStatus(status: IncidentStatus) {
  if (status === selectedIncident.value?.status) return
  if (status === 'closed') {
    pendingStatus.value = status
    statusConfirmOpen.value = true
    return
  }
  void updateIncidentStatus(status)
}

async function confirmIncidentStatus() {
  const status = pendingStatus.value
  if (!status) return
  await updateIncidentStatus(status)
  statusConfirmOpen.value = false
  pendingStatus.value = null
}

function confirmUnsavedNavigation() {
  if (!formDirty.value || !dashboardHydrated.value) return true
  return new Promise<boolean>((resolve) => {
    pendingDetailAction = () => resolve(true)
    pendingCancelAction = () => resolve(false)
    discardConfirmOpen.value = true
  })
}

onBeforeRouteUpdate(confirmUnsavedNavigation)
onBeforeRouteLeave(confirmUnsavedNavigation)

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!formDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  dashboardHydrated.value = true
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-incidents"
    title="Incident Reports"
    :busy="pending"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: form.id ? 'Save incident' : 'Create incident',
          icon: 'i-lucide-save',
          loading: saving,
          disabled: !canMutate,
          onSelect: () => { void saveIncident() }
        }"
        :secondary="[
          {
            label: 'New incident',
            icon: 'i-lucide-file-plus-2',
            color: 'neutral',
            variant: 'soft',
            disabled: !canMutate,
            onSelect: () => createNewIncidentDraft()
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

    <DashboardSectionState
      v-if="pending && !hasIncidentData"
      state="loading"
      title="Loading incident reports"
      description="Fetching incident, member, and linked expense records."
    />
    <DashboardSectionState
      v-else-if="loadError && !hasIncidentData"
      state="error"
      title="Incident reports unavailable"
      :description="readErrorMessage(loadError)"
      show-retry
      @retry="refresh"
    />
    <DashboardSectionState
      v-else-if="loadError"
      state="error"
      color="warning"
      icon="i-lucide-clock-alert"
      title="Showing stale incident data"
      :description="`${readErrorMessage(loadError)} Mutations are disabled until refresh succeeds.`"
      show-retry
      @retry="refresh"
    />

    <template v-if="hasIncidentData">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UCard class="admin-panel-card border-0">
          <div class="text-xs uppercase tracking-wide text-dimmed">
            Open + investigating
          </div>
          <div class="mt-2 text-3xl font-light">
            {{ summary.openCount + summary.investigatingCount }}
          </div>
        </UCard>
        <UCard class="admin-panel-card border-0">
          <div class="text-xs uppercase tracking-wide text-dimmed">
            High severity open
          </div>
          <div class="mt-2 text-3xl font-light">
            {{ summary.highSeverityOpenCount }}
          </div>
        </UCard>
        <UCard class="admin-panel-card border-0">
          <div class="text-xs uppercase tracking-wide text-dimmed">
            Linked expenses
          </div>
          <div class="mt-2 text-3xl font-light">
            {{ summary.linkedExpenseCount }}
          </div>
        </UCard>
        <UCard class="admin-panel-card border-0">
          <div class="text-xs uppercase tracking-wide text-dimmed">
            Linked expense total
          </div>
          <div class="mt-2 text-3xl font-light">
            {{ formatMoney(summary.linkedExpenseTotalCents) }}
          </div>
        </UCard>
      </div>

      <DashboardDataPanel
        list-title="Incident list"
        list-description="Search and filter reports, then review or update one in detail."
        detail-title="Incident detail"
        detail-description="Routing, ownership, status transitions, and linked expense context."
        list-width-class="xl:grid-cols-[24rem_minmax(0,1fr)]"
        mobile-drawer
        :mobile-detail-open="mobileDetailOpen"
        mobile-detail-label="Incident details"
        @close-mobile-detail="closeMobileDetail"
      >
        <template #list-controls>
          <UCard class="admin-panel-card border-0">
            <div class="grid gap-3">
              <UFormField label="Search">
                <UInput
                  v-model="filters.search"
                  icon="i-lucide-search"
                  placeholder="Title, description, member"
                />
              </UFormField>
              <UFormField label="Status">
                <USelect
                  v-model="filters.status"
                  :items="[
                    { label: 'All statuses', value: 'all' },
                    { label: 'Open', value: 'open' },
                    { label: 'Investigating', value: 'investigating' },
                    { label: 'Resolved', value: 'resolved' },
                    { label: 'Closed', value: 'closed' }
                  ]"
                />
              </UFormField>
              <UFormField label="Severity">
                <USelect
                  v-model="filters.severity"
                  :items="[
                    { label: 'All severities', value: 'all' },
                    { label: 'Low', value: 'low' },
                    { label: 'Medium', value: 'medium' },
                    { label: 'High', value: 'high' },
                    { label: 'Critical', value: 'critical' }
                  ]"
                />
              </UFormField>
              <UFormField label="Category">
                <USelect
                  v-model="filters.category"
                  :items="[
                    { label: 'All categories', value: 'all' },
                    { label: 'Safety', value: 'safety' },
                    { label: 'Facility', value: 'facility' },
                    { label: 'Equipment', value: 'equipment' },
                    { label: 'Access', value: 'access' },
                    { label: 'Billing', value: 'billing' },
                    { label: 'Member', value: 'member' },
                    { label: 'Policy', value: 'policy' },
                    { label: 'Other', value: 'other' }
                  ]"
                />
              </UFormField>
              <UFormField label="Member">
                <USelect
                  v-model="filters.memberUserId"
                  :items="memberSelectOptions"
                />
              </UFormField>
            </div>
          </UCard>
        </template>

        <template #list>
          <UCard
            v-if="!incidents.length"
            class="admin-panel-card border-0"
          >
            <DashboardSectionState
              state="empty"
              title="No incidents"
              description="No incident reports match the current filters."
            />
          </UCard>

          <div
            v-else
            class="space-y-2"
          >
            <button
              v-for="incident in incidents"
              :key="incident.id"
              type="button"
              class="w-full rounded-lg border border-default/70 p-3 text-left transition-colors hover:bg-elevated/70"
              :class="{ 'bg-elevated/75 ring-1 ring-primary/40': selectedIncidentId === incident.id }"
              :aria-current="selectedIncidentId === incident.id ? 'true' : undefined"
              :aria-label="`Open incident ${incident.title}, ${incident.severity} severity, ${incident.status}`"
              @click="selectIncident(incident)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="font-medium text-sm text-highlighted">
                  {{ incident.title }}
                </div>
                <div class="flex items-center gap-1">
                  <UBadge
                    size="xs"
                    :color="severityColor(incident.severity)"
                    variant="soft"
                  >
                    {{ incident.severity }}
                  </UBadge>
                  <UBadge
                    size="xs"
                    :color="statusColor(incident.status)"
                    variant="soft"
                  >
                    {{ incident.status }}
                  </UBadge>
                </div>
              </div>
              <div class="mt-1 text-xs text-dimmed">
                {{ incident.category }} · {{ incident.memberLabel || 'No member linked' }}
              </div>
              <div class="mt-2 text-xs text-dimmed">
                Linked expenses: {{ incident.relatedExpenses.linkedExpenseCount }} ({{ formatMoney(incident.relatedExpenses.linkedExpenseTotalCents) }})
              </div>
            </button>
          </div>
        </template>

        <template #detail-controls>
          <UCard class="admin-panel-card border-0">
            <AppAlert
              v-if="formDirty"
              class="mb-3"
              color="warning"
              variant="soft"
              icon="i-lucide-pencil-line"
              title="Unsaved incident changes"
              description="A status change will save these fields before moving the incident."
            />
            <div class="flex flex-wrap gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                :loading="updatingStatus"
                :disabled="!form.id || !canMutate || selectedIncident?.status === 'open'"
                @click="requestIncidentStatus('open')"
              >
                Mark open
              </UButton>
              <UButton
                size="xs"
                color="warning"
                variant="soft"
                :loading="updatingStatus"
                :disabled="!form.id || !canMutate || selectedIncident?.status === 'investigating'"
                @click="requestIncidentStatus('investigating')"
              >
                Mark investigating
              </UButton>
              <UButton
                size="xs"
                color="success"
                variant="soft"
                :loading="updatingStatus"
                :disabled="!form.id || !canMutate || selectedIncident?.status === 'resolved'"
                @click="requestIncidentStatus('resolved')"
              >
                Mark resolved
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                :loading="updatingStatus"
                :disabled="!form.id || !canMutate || selectedIncident?.status === 'closed'"
                @click="requestIncidentStatus('closed')"
              >
                Mark closed
              </UButton>

              <UButton
                size="xs"
                color="primary"
                variant="soft"
                :disabled="!form.id"
                :to="form.id ? `/dashboard/admin/expenses?incidentId=${encodeURIComponent(form.id)}` : undefined"
              >
                Create expense for incident
              </UButton>
            </div>
          </UCard>
        </template>

        <template #detail>
          <UCard class="admin-panel-card border-0">
            <div class="grid gap-3 md:grid-cols-2">
              <UFormField
                label="Title"
                class="md:col-span-2"
              >
                <UInput v-model="form.title" />
              </UFormField>

              <UFormField label="Category">
                <USelect
                  v-model="form.category"
                  :items="[
                    { label: 'Safety', value: 'safety' },
                    { label: 'Facility', value: 'facility' },
                    { label: 'Equipment', value: 'equipment' },
                    { label: 'Access', value: 'access' },
                    { label: 'Billing', value: 'billing' },
                    { label: 'Member', value: 'member' },
                    { label: 'Policy', value: 'policy' },
                    { label: 'Other', value: 'other' }
                  ]"
                />
              </UFormField>

              <UFormField label="Severity">
                <USelect
                  v-model="form.severity"
                  :items="[
                    { label: 'Low', value: 'low' },
                    { label: 'Medium', value: 'medium' },
                    { label: 'High', value: 'high' },
                    { label: 'Critical', value: 'critical' }
                  ]"
                />
              </UFormField>

              <UFormField label="Linked member">
                <USelect
                  v-model="form.memberUserId"
                  :items="incidentMemberSelectOptions"
                />
              </UFormField>

              <UFormField label="Occurred at">
                <UInput
                  v-model="form.occurredAtLocal"
                  type="datetime-local"
                />
              </UFormField>

              <UFormField
                label="Description"
                class="md:col-span-2"
              >
                <UTextarea
                  v-model="form.description"
                  :rows="7"
                />
              </UFormField>
            </div>
          </UCard>

          <UCard
            v-if="selectedIncident"
            class="admin-panel-card border-0"
          >
            <div class="grid gap-3 md:grid-cols-2">
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Status
                </div>
                <div class="mt-1 text-sm">
                  {{ selectedIncident.status }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Updated
                </div>
                <div class="mt-1 text-sm">
                  {{ formatDateTime(selectedIncident.updatedAt) }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Resolved at
                </div>
                <div class="mt-1 text-sm">
                  {{ formatDateTime(selectedIncident.resolvedAt) }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Closed at
                </div>
                <div class="mt-1 text-sm">
                  {{ formatDateTime(selectedIncident.closedAt) }}
                </div>
              </div>
              <div class="md:col-span-2">
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Related expenses
                </div>
                <div class="mt-1 text-sm text-toned">
                  {{ selectedIncident.relatedExpenses.linkedExpenseCount }} linked · {{ formatMoney(selectedIncident.relatedExpenses.linkedExpenseTotalCents) }} total
                </div>
                <div class="mt-2 flex flex-wrap gap-1 text-xs">
                  <UBadge
                    color="neutral"
                    variant="soft"
                  >
                    Draft {{ selectedIncident.relatedExpenses.draftExpenseCount }}
                  </UBadge>
                  <UBadge
                    color="warning"
                    variant="soft"
                  >
                    Submitted {{ selectedIncident.relatedExpenses.submittedExpenseCount }}
                  </UBadge>
                  <UBadge
                    color="primary"
                    variant="soft"
                  >
                    Approved {{ selectedIncident.relatedExpenses.approvedExpenseCount }}
                  </UBadge>
                  <UBadge
                    color="error"
                    variant="soft"
                  >
                    Rejected {{ selectedIncident.relatedExpenses.rejectedExpenseCount }}
                  </UBadge>
                  <UBadge
                    color="success"
                    variant="soft"
                  >
                    Paid {{ selectedIncident.relatedExpenses.paidExpenseCount }}
                  </UBadge>
                </div>
              </div>
            </div>
          </UCard>
        </template>
      </DashboardDataPanel>
    </template>

    <ConfirmDialog
      v-model:open="discardConfirmOpen"
      title="Discard unsaved incident changes?"
      description="The current incident fields have not been saved. This action cannot restore those edits."
      confirm-label="Discard changes"
      color="error"
      @confirm="confirmDiscardChanges"
      @cancel="cancelDiscardChanges"
    />

    <ConfirmDialog
      v-model:open="statusConfirmOpen"
      title="Close this incident?"
      :description="formDirty ? 'Unsaved fields will be saved first, then the incident will be closed.' : 'Closing records the current time and admin as the closure audit.'"
      confirm-label="Save and close"
      color="warning"
      :busy="updatingStatus || saving"
      @confirm="confirmIncidentStatus"
      @cancel="pendingStatus = null"
    />
  </DashboardPageScaffold>
</template>
