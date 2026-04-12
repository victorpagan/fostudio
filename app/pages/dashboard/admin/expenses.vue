<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

const route = useRoute()

type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid'
type ExpenseCategory = 'supplies' | 'maintenance' | 'contractor' | 'utilities' | 'software' | 'refund' | 'travel' | 'other'

type MemberOption = {
  userId: string
  name: string | null
  email: string | null
  label: string
  membershipStatus: string | null
  tier: string | null
}

type IncidentOption = {
  id: string
  title: string
  status: string
  severity: string
  occurredAt: string | null
  updatedAt: string
}

type ExpenseRow = {
  id: string
  title: string
  description: string
  category: ExpenseCategory
  status: ExpenseStatus
  amountCents: number
  currency: 'USD'
  incurredOn: string | null
  vendorName: string
  receiptUrls: string[]
  memberUserId: string | null
  memberLabel: string | null
  incidentId: string | null
  incidentTitle: string | null
  incidentSeverity: string | null
  incidentStatus: string | null
  submittedAt: string | null
  submittedBy: string | null
  approvedAt: string | null
  approvedBy: string | null
  rejectedAt: string | null
  rejectedBy: string | null
  rejectionReason: string | null
  paidAt: string | null
  paidBy: string | null
  paymentReference: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

type ExpensesPayload = {
  expenses: ExpenseRow[]
  summary: {
    totalCount: number
    draftCount: number
    submittedCount: number
    approvedCount: number
    rejectedCount: number
    paidCount: number
    totalAmountCents: number
    submittedAmountCents: number
    approvedAmountCents: number
    paidAmountCents: number
  }
  memberOptions: MemberOption[]
  incidentOptions: IncidentOption[]
}

const toast = useToast()

const filters = reactive({
  search: '',
  status: 'all' as 'all' | ExpenseStatus,
  category: 'all' as 'all' | ExpenseCategory,
  memberUserId: 'all' as 'all' | string,
  incidentId: 'all' as 'all' | string
})

const selectedExpenseId = ref<string | null>(null)
const incidentPrefillApplied = ref(false)
const saving = ref(false)
const updatingStatus = ref(false)
const statusNotes = reactive({
  rejectionReason: '',
  paymentReference: ''
})

const form = reactive({
  id: '' as string,
  title: '',
  description: '',
  category: 'supplies' as ExpenseCategory,
  amountCents: 0,
  incurredOn: '',
  vendorName: '',
  receiptUrlsText: '',
  memberUserId: 'none' as string,
  incidentId: 'none' as string
})

const prefilledIncidentId = computed(() => {
  const raw = route.query.incidentId
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw)) {
    const first = raw.find(value => typeof value === 'string' && value.trim())
    if (typeof first === 'string') return first.trim()
  }
  return null
})

const query = computed(() => ({
  search: filters.search.trim() || undefined,
  status: filters.status === 'all' ? undefined : filters.status,
  category: filters.category === 'all' ? undefined : filters.category,
  memberUserId: filters.memberUserId === 'all' ? undefined : filters.memberUserId,
  incidentId: filters.incidentId === 'all' ? undefined : filters.incidentId
}))

const { data, pending, refresh } = await useAsyncData<ExpensesPayload>('admin:expenses', async () => {
  return await $fetch('/api/admin/expenses', { query: query.value })
}, { watch: [query] })

const expenses = computed(() => data.value?.expenses ?? [])
const summary = computed(() => data.value?.summary ?? {
  totalCount: 0,
  draftCount: 0,
  submittedCount: 0,
  approvedCount: 0,
  rejectedCount: 0,
  paidCount: 0,
  totalAmountCents: 0,
  submittedAmountCents: 0,
  approvedAmountCents: 0,
  paidAmountCents: 0
})
const memberOptions = computed(() => data.value?.memberOptions ?? [])
const incidentOptions = computed(() => data.value?.incidentOptions ?? [])

const selectedExpense = computed(() => expenses.value.find(row => row.id === selectedExpenseId.value) ?? null)

const memberFilterOptions = computed(() => [
  { label: 'All members', value: 'all' },
  ...memberOptions.value.map(option => ({ label: option.label, value: option.userId }))
])

const memberFormOptions = computed(() => [
  { label: 'No linked member', value: 'none' },
  ...memberOptions.value.map(option => ({ label: option.label, value: option.userId }))
])

const incidentFilterOptions = computed(() => [
  { label: 'All incidents', value: 'all' },
  ...incidentOptions.value.map(option => ({ label: option.title, value: option.id }))
])

const incidentFormOptions = computed(() => [
  { label: 'No linked incident', value: 'none' },
  ...incidentOptions.value.map(option => ({
    label: `${option.title} (${option.status})`,
    value: option.id
  }))
])

watch(expenses, (rows) => {
  if (!rows.length) {
    selectedExpenseId.value = null
    return
  }

  if (selectedExpenseId.value && rows.some(row => row.id === selectedExpenseId.value)) return
  if (prefilledIncidentId.value && !incidentPrefillApplied.value) return
  selectedExpenseId.value = rows[0]!.id
}, { immediate: true })

watch(selectedExpense, (row) => {
  if (!row) {
    applyBlankForm()
    return
  }

  form.id = row.id
  form.title = row.title
  form.description = row.description
  form.category = row.category
  form.amountCents = row.amountCents
  form.incurredOn = row.incurredOn ?? ''
  form.vendorName = row.vendorName
  form.receiptUrlsText = row.receiptUrls.join('\n')
  form.memberUserId = row.memberUserId ?? 'none'
  form.incidentId = row.incidentId ?? 'none'

  statusNotes.rejectionReason = row.rejectionReason ?? ''
  statusNotes.paymentReference = row.paymentReference ?? ''
}, { immediate: true })

watch([prefilledIncidentId, incidentOptions], ([incidentId]) => {
  if (!incidentId) return
  if (incidentPrefillApplied.value) return
  if (!incidentOptions.value.some(option => option.id === incidentId)) return

  selectedExpenseId.value = null
  applyBlankForm()
  form.incidentId = incidentId
  incidentPrefillApplied.value = true
}, { immediate: true })

function applyBlankForm() {
  form.id = ''
  form.title = ''
  form.description = ''
  form.category = 'supplies'
  form.amountCents = 0
  form.incurredOn = ''
  form.vendorName = ''
  form.receiptUrlsText = ''
  form.memberUserId = 'none'
  form.incidentId = prefilledIncidentId.value ?? 'none'

  statusNotes.rejectionReason = ''
  statusNotes.paymentReference = ''
}

function createNewExpenseDraft() {
  selectedExpenseId.value = null
  applyBlankForm()
}

function parseReceiptUrls(text: string) {
  return text
    .split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean)
}

function statusColor(status: ExpenseStatus) {
  if (status === 'paid') return 'success'
  if (status === 'approved') return 'primary'
  if (status === 'submitted') return 'warning'
  if (status === 'rejected') return 'error'
  return 'neutral'
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

async function saveExpense() {
  if (saving.value) return
  saving.value = true

  try {
    const payload = {
      id: form.id || undefined,
      title: form.title,
      description: form.description,
      category: form.category,
      amountCents: Math.max(0, Number(form.amountCents || 0)),
      currency: 'USD' as const,
      incurredOn: form.incurredOn.trim() || null,
      vendorName: form.vendorName,
      receiptUrls: parseReceiptUrls(form.receiptUrlsText),
      memberUserId: form.memberUserId === 'none' ? null : form.memberUserId,
      incidentId: form.incidentId === 'none' ? null : form.incidentId
    }

    const result = await $fetch<{ expense: { id: string } }>('/api/admin/expenses.upsert', {
      method: 'POST',
      body: payload
    })

    toast.add({ title: 'Expense report saved', color: 'success' })
    await refresh()

    const id = String(result.expense?.id ?? '').trim()
    if (id) selectedExpenseId.value = id
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save expense report',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function moveStatus(status: ExpenseStatus) {
  const id = form.id || selectedExpenseId.value
  if (!id || updatingStatus.value) return

  updatingStatus.value = true

  try {
    await $fetch('/api/admin/expenses.status', {
      method: 'POST',
      body: {
        id,
        status,
        rejectionReason: status === 'rejected' ? (statusNotes.rejectionReason.trim() || null) : null,
        paymentReference: status === 'paid' ? (statusNotes.paymentReference.trim() || null) : null
      }
    })

    toast.add({ title: `Expense moved to ${status}`, color: 'success' })
    await refresh()
    selectedExpenseId.value = id
  } catch (error: unknown) {
    toast.add({
      title: 'Could not update expense status',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    updatingStatus.value = false
  }
}

const availableTransitions = computed(() => {
  const status = selectedExpense.value?.status ?? 'draft'

  if (status === 'draft') return ['submitted'] as ExpenseStatus[]
  if (status === 'submitted') return ['approved', 'rejected'] as ExpenseStatus[]
  if (status === 'approved') return ['paid', 'rejected'] as ExpenseStatus[]
  if (status === 'rejected') return ['draft', 'submitted'] as ExpenseStatus[]
  return [] as ExpenseStatus[]
})
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-expenses"
    title="Expense Reports"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: form.id ? 'Save expense' : 'Create expense',
          icon: 'i-lucide-save',
          loading: saving,
          onSelect: () => { void saveExpense() }
        }"
        :secondary="[
          {
            label: 'New expense',
            icon: 'i-lucide-receipt',
            color: 'neutral',
            variant: 'soft',
            onSelect: () => createNewExpenseDraft()
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
          Submitted
        </div>
        <div class="mt-2 text-3xl font-light">
          {{ summary.submittedCount }}
        </div>
      </UCard>
      <UCard class="admin-panel-card border-0">
        <div class="text-xs uppercase tracking-wide text-dimmed">
          Approved unpaid
        </div>
        <div class="mt-2 text-3xl font-light">
          {{ summary.approvedCount }}
        </div>
      </UCard>
      <UCard class="admin-panel-card border-0">
        <div class="text-xs uppercase tracking-wide text-dimmed">
          Submitted + approved
        </div>
        <div class="mt-2 text-3xl font-light">
          {{ formatMoney(summary.submittedAmountCents + summary.approvedAmountCents) }}
        </div>
      </UCard>
      <UCard class="admin-panel-card border-0">
        <div class="text-xs uppercase tracking-wide text-dimmed">
          Paid total
        </div>
        <div class="mt-2 text-3xl font-light">
          {{ formatMoney(summary.paidAmountCents) }}
        </div>
      </UCard>
    </div>

    <DashboardDataPanel
      list-title="Expense list"
      list-description="Track approval pipeline, payouts, and incident-linked costs."
      detail-title="Expense detail"
      detail-description="Edit report fields and run workflow transitions."
      list-width-class="xl:grid-cols-[24rem_minmax(0,1fr)]"
    >
      <template #list-controls>
        <UCard class="admin-panel-card border-0">
          <div class="grid gap-3">
            <UFormField label="Search">
              <UInput
                v-model="filters.search"
                icon="i-lucide-search"
                placeholder="Title, vendor, incident"
              />
            </UFormField>
            <UFormField label="Status">
              <USelect
                v-model="filters.status"
                :items="[
                  { label: 'All statuses', value: 'all' },
                  { label: 'Draft', value: 'draft' },
                  { label: 'Submitted', value: 'submitted' },
                  { label: 'Approved', value: 'approved' },
                  { label: 'Rejected', value: 'rejected' },
                  { label: 'Paid', value: 'paid' }
                ]"
              />
            </UFormField>
            <UFormField label="Category">
              <USelect
                v-model="filters.category"
                :items="[
                  { label: 'All categories', value: 'all' },
                  { label: 'Supplies', value: 'supplies' },
                  { label: 'Maintenance', value: 'maintenance' },
                  { label: 'Contractor', value: 'contractor' },
                  { label: 'Utilities', value: 'utilities' },
                  { label: 'Software', value: 'software' },
                  { label: 'Refund', value: 'refund' },
                  { label: 'Travel', value: 'travel' },
                  { label: 'Other', value: 'other' }
                ]"
              />
            </UFormField>
            <UFormField label="Member">
              <USelect
                v-model="filters.memberUserId"
                :items="memberFilterOptions"
              />
            </UFormField>
            <UFormField label="Incident">
              <USelect
                v-model="filters.incidentId"
                :items="incidentFilterOptions"
              />
            </UFormField>
          </div>
        </UCard>
      </template>

      <template #list>
        <UCard
          v-if="!expenses.length"
          class="admin-panel-card border-0"
        >
          <DashboardSectionState
            state="empty"
            title="No expenses"
            description="No expense reports match the current filters."
          />
        </UCard>

        <div
          v-else
          class="space-y-2"
        >
          <button
            v-for="expense in expenses"
            :key="expense.id"
            type="button"
            class="w-full rounded-lg border border-default/70 p-3 text-left transition-colors hover:bg-elevated/70"
            :class="{ 'bg-elevated/75 ring-1 ring-primary/40': selectedExpenseId === expense.id }"
            @click="selectedExpenseId = expense.id"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="font-medium text-sm text-highlighted">
                {{ expense.title }}
              </div>
              <UBadge
                size="xs"
                :color="statusColor(expense.status)"
                variant="soft"
              >
                {{ expense.status }}
              </UBadge>
            </div>
            <div class="mt-1 text-xs text-dimmed">
              {{ expense.category }} · {{ expense.vendorName || 'No vendor' }}
            </div>
            <div class="mt-1 text-xs text-dimmed">
              {{ formatMoney(expense.amountCents) }} · {{ expense.incidentTitle || 'No linked incident' }}
            </div>
          </button>
        </div>
      </template>

      <template #detail-controls>
        <UCard class="admin-panel-card border-0">
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="nextStatus in availableTransitions"
              :key="`transition-${nextStatus}`"
              size="xs"
              :color="statusColor(nextStatus)"
              variant="soft"
              :loading="updatingStatus"
              :disabled="!selectedExpense"
              @click="moveStatus(nextStatus)"
            >
              Move to {{ nextStatus }}
            </UButton>

            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              :disabled="!form.incidentId || form.incidentId === 'none'"
              :to="form.incidentId && form.incidentId !== 'none' ? `/dashboard/admin/incidents?incidentId=${encodeURIComponent(form.incidentId)}` : undefined"
            >
              Open linked incident
            </UButton>
          </div>

          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <UFormField label="Rejection reason (used on reject)">
              <UInput v-model="statusNotes.rejectionReason" />
            </UFormField>
            <UFormField label="Payment reference (used on paid)">
              <UInput v-model="statusNotes.paymentReference" />
            </UFormField>
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
                  { label: 'Supplies', value: 'supplies' },
                  { label: 'Maintenance', value: 'maintenance' },
                  { label: 'Contractor', value: 'contractor' },
                  { label: 'Utilities', value: 'utilities' },
                  { label: 'Software', value: 'software' },
                  { label: 'Refund', value: 'refund' },
                  { label: 'Travel', value: 'travel' },
                  { label: 'Other', value: 'other' }
                ]"
              />
            </UFormField>

            <UFormField label="Amount (cents)">
              <UInput
                v-model.number="form.amountCents"
                type="number"
                min="0"
                step="1"
              />
            </UFormField>

            <UFormField label="Incurred on">
              <UInput
                v-model="form.incurredOn"
                type="date"
              />
            </UFormField>

            <UFormField label="Vendor">
              <UInput v-model="form.vendorName" />
            </UFormField>

            <UFormField label="Linked member">
              <USelect
                v-model="form.memberUserId"
                :items="memberFormOptions"
              />
            </UFormField>

            <UFormField label="Linked incident">
              <USelect
                v-model="form.incidentId"
                :items="incidentFormOptions"
              />
            </UFormField>

            <UFormField
              label="Receipt URLs (one per line)"
              class="md:col-span-2"
            >
              <UTextarea
                v-model="form.receiptUrlsText"
                :rows="4"
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
          v-if="selectedExpense"
          class="admin-panel-card border-0"
        >
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Current status
              </div>
              <div class="mt-1 text-sm">
                {{ selectedExpense.status }}
              </div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Updated at
              </div>
              <div class="mt-1 text-sm">
                {{ formatDateTime(selectedExpense.updatedAt) }}
              </div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Submitted at
              </div>
              <div class="mt-1 text-sm">
                {{ formatDateTime(selectedExpense.submittedAt) }}
              </div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Approved at
              </div>
              <div class="mt-1 text-sm">
                {{ formatDateTime(selectedExpense.approvedAt) }}
              </div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Rejected at
              </div>
              <div class="mt-1 text-sm">
                {{ formatDateTime(selectedExpense.rejectedAt) }}
              </div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Paid at
              </div>
              <div class="mt-1 text-sm">
                {{ formatDateTime(selectedExpense.paidAt) }}
              </div>
            </div>
            <div class="md:col-span-2">
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Linked incident
              </div>
              <div class="mt-1 text-sm text-toned">
                {{ selectedExpense.incidentTitle || 'No linked incident' }}
              </div>
            </div>
          </div>
        </UCard>
      </template>
    </DashboardDataPanel>
  </DashboardPageScaffold>
</template>
