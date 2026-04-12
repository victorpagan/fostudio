<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })
const route = useRoute()

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

const { data, pending, refresh } = await useAsyncData<IncidentsPayload>('admin:incidents', async () => {
  return await $fetch('/api/admin/incidents', { query: query.value })
}, { watch: [query] })

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

watch(incidents, (rows) => {
  if (!rows.length) {
    selectedIncidentId.value = null
    return
  }

  if (selectedIncidentId.value && rows.some(row => row.id === selectedIncidentId.value)) return
  selectedIncidentId.value = rows[0]!.id
}, { immediate: true })

watch([() => route.query.incidentId, incidents], () => {
  const raw = route.query.incidentId
  const value = typeof raw === 'string'
    ? raw.trim()
    : Array.isArray(raw)
      ? String(raw.find(item => typeof item === 'string' && item.trim()) ?? '').trim()
      : ''

  if (!value) return
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
  form.occurredAtLocal = toLocalDatetimeInput(incident.occurredAt)
}, { immediate: true })

function resetForm() {
  form.id = ''
  form.title = ''
  form.description = ''
  form.category = 'access'
  form.severity = 'medium'
  form.memberUserId = 'none'
  form.occurredAtLocal = ''
}

function createNewIncidentDraft() {
  selectedIncidentId.value = null
  resetForm()
}

function toLocalDatetimeInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalDatetimeInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US')
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

async function saveIncident() {
  if (saving.value) return
  saving.value = true
  try {
    const payload = {
      id: form.id || undefined,
      title: form.title,
      description: form.description,
      category: form.category,
      severity: form.severity,
      memberUserId: form.memberUserId === 'none' ? null : form.memberUserId,
      occurredAt: fromLocalDatetimeInput(form.occurredAtLocal)
    }

    const result = await $fetch<{ incident: { id: string } }>('/api/admin/incidents.upsert', {
      method: 'POST',
      body: payload
    })

    toast.add({ title: 'Incident report saved', color: 'success' })
    await refresh()

    const id = String(result.incident?.id ?? '').trim()
    if (id) selectedIncidentId.value = id
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save incident report',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function updateIncidentStatus(status: IncidentStatus) {
  const id = form.id || selectedIncidentId.value
  if (!id || updatingStatus.value) return

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
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-incidents"
    title="Incident Reports"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: form.id ? 'Save incident' : 'Create incident',
          icon: 'i-lucide-save',
          loading: saving,
          onSelect: () => { void saveIncident() }
        }"
        :secondary="[
          {
            label: 'New incident',
            icon: 'i-lucide-file-plus-2',
            color: 'neutral',
            variant: 'soft',
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
            @click="selectedIncidentId = incident.id"
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
          <div class="flex flex-wrap gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :loading="updatingStatus"
              :disabled="!form.id"
              @click="updateIncidentStatus('open')"
            >
              Mark open
            </UButton>
            <UButton
              size="xs"
              color="warning"
              variant="soft"
              :loading="updatingStatus"
              :disabled="!form.id"
              @click="updateIncidentStatus('investigating')"
            >
              Mark investigating
            </UButton>
            <UButton
              size="xs"
              color="success"
              variant="soft"
              :loading="updatingStatus"
              :disabled="!form.id"
              @click="updateIncidentStatus('resolved')"
            >
              Mark resolved
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :loading="updatingStatus"
              :disabled="!form.id"
              @click="updateIncidentStatus('closed')"
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
  </DashboardPageScaffold>
</template>
