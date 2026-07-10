<script setup lang="ts">
import { formatCentsForUsdInput, parseUsdInputToCents } from '~~/app/utils/adminMoney'
import { formatAdminDateTime } from '~~/app/utils/adminTime'

definePageMeta({ middleware: ['admin'] })

const route = useRoute()
const router = useRouter()

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
const dashboardHydrated = ref(false)
const savedFormSnapshot = ref('')
const savedStatusNotesSnapshot = ref('')
const discardConfirmOpen = ref(false)
const statusConfirmOpen = ref(false)
const pendingStatus = ref<ExpenseStatus | null>(null)
let pendingDetailAction: (() => void) | null = null
let pendingCancelAction: (() => void) | null = null
const statusNotes = reactive({
  rejectionReason: '',
  paymentReference: ''
})

const form = reactive({
  id: '' as string,
  title: '',
  description: '',
  category: 'supplies' as ExpenseCategory,
  amountDollars: '0.00',
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

const { data, pending, refresh, error: loadError } = await useAsyncData<ExpensesPayload>('admin:expenses', async () => {
  return await $fetch('/api/admin/expenses', { query: query.value })
}, { watch: [query] })

const hasExpenseData = computed(() => Boolean(data.value))
const canMutate = computed(() => dashboardHydrated.value && hasExpenseData.value && !pending.value && !loadError.value)
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
const routeExpenseId = computed(() => readQueryValue(route.query.expenseId))
const mobileDetailOpen = computed(() => Boolean(routeExpenseId.value || prefilledIncidentId.value))

function currentFormSnapshot() {
  return JSON.stringify({
    id: form.id,
    title: form.title.trim(),
    description: form.description,
    category: form.category,
    amountDollars: form.amountDollars.trim(),
    incurredOn: form.incurredOn,
    vendorName: form.vendorName,
    receiptUrlsText: form.receiptUrlsText,
    memberUserId: form.memberUserId,
    incidentId: form.incidentId
  })
}

function currentStatusNotesSnapshot() {
  return JSON.stringify({
    rejectionReason: statusNotes.rejectionReason,
    paymentReference: statusNotes.paymentReference
  })
}

const formDirty = computed(() => Boolean(savedFormSnapshot.value) && currentFormSnapshot() !== savedFormSnapshot.value)
const statusNotesDirty = computed(() => Boolean(savedStatusNotesSnapshot.value) && currentStatusNotesSnapshot() !== savedStatusNotesSnapshot.value)
const expenseDirty = computed(() => formDirty.value || statusNotesDirty.value)

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
  form.amountDollars = formatCentsForUsdInput(row.amountCents)
  form.incurredOn = row.incurredOn ?? ''
  form.vendorName = row.vendorName
  form.receiptUrlsText = row.receiptUrls.join('\n')
  form.memberUserId = row.memberUserId ?? 'none'
  form.incidentId = row.incidentId ?? 'none'

  statusNotes.rejectionReason = row.rejectionReason ?? ''
  statusNotes.paymentReference = row.paymentReference ?? ''
  savedFormSnapshot.value = currentFormSnapshot()
  savedStatusNotesSnapshot.value = currentStatusNotesSnapshot()
}, { immediate: true })

watch([routeExpenseId, expenses], ([expenseId]) => {
  if (!expenseId) return
  if (expenseId === 'new') {
    if (selectedExpenseId.value || form.id) {
      selectedExpenseId.value = null
      applyBlankForm()
    }
    return
  }

  if (expenses.value.some(row => row.id === expenseId)) selectedExpenseId.value = expenseId
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
  form.amountDollars = '0.00'
  form.incurredOn = ''
  form.vendorName = ''
  form.receiptUrlsText = ''
  form.memberUserId = 'none'
  form.incidentId = prefilledIncidentId.value ?? 'none'

  statusNotes.rejectionReason = ''
  statusNotes.paymentReference = ''
  savedFormSnapshot.value = currentFormSnapshot()
  savedStatusNotesSnapshot.value = currentStatusNotesSnapshot()
}

function createNewExpenseDraft() {
  requestDetailAction(() => {
    selectedExpenseId.value = null
    applyBlankForm()
    void syncExpenseRoute('new')
  })
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
  return formatAdminDateTime(value)
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

function readQueryValue(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.trim())
    if (typeof first === 'string') return first.trim()
  }
  return null
}

function syncExpenseRoute(expenseId: string | null) {
  return router.replace({
    path: route.path,
    query: {
      ...route.query,
      expenseId: expenseId || undefined,
      incidentId: expenseId && expenseId !== 'new' ? undefined : route.query.incidentId
    }
  })
}

function requestDetailAction(action: () => void) {
  if (!expenseDirty.value) {
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

function selectExpense(row: ExpenseRow) {
  requestDetailAction(() => {
    selectedExpenseId.value = row.id
    void syncExpenseRoute(row.id)
  })
}

function closeMobileDetail() {
  requestDetailAction(() => {
    void router.replace({
      path: route.path,
      query: {
        ...route.query,
        expenseId: undefined,
        incidentId: undefined
      }
    })
  })
}

async function saveExpense(): Promise<string | null> {
  if (saving.value || !canMutate.value) return null

  const amountCents = parseUsdInputToCents(form.amountDollars, 10_000_000)
  if (amountCents === null) {
    toast.add({
      title: 'Invalid expense amount',
      description: 'Enter a USD amount from 0.00 through 100000.00 with no more than two decimal places.',
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
      amountCents,
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
    if (id) {
      selectedExpenseId.value = id
      savedFormSnapshot.value = currentFormSnapshot()
      await syncExpenseRoute(id)
    }
    return id || null
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save expense report',
      description: readErrorMessage(error),
      color: 'error'
    })
    return null
  } finally {
    saving.value = false
  }
}

async function moveStatus(status: ExpenseStatus) {
  if (!canMutate.value || updatingStatus.value) return

  if (status === 'rejected' && statusNotes.rejectionReason.trim().length < 3) {
    toast.add({
      title: 'Rejection reason required',
      description: 'Add at least 3 characters for the rejection audit.',
      color: 'error'
    })
    return
  }

  if (status === 'paid' && statusNotes.paymentReference.trim().length < 2) {
    toast.add({
      title: 'Payment reference required',
      description: 'Add a check, transfer, or transaction reference for the payment audit.',
      color: 'error'
    })
    return
  }

  let id = form.id || selectedExpenseId.value
  if (!id) return

  if (formDirty.value) {
    const savedId = await saveExpense()
    if (!savedId) return
    id = savedId
  }

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

function requestMoveStatus(status: ExpenseStatus) {
  if (status === 'rejected' || status === 'paid') {
    pendingStatus.value = status
    statusConfirmOpen.value = true
    return
  }
  void moveStatus(status)
}

const pendingAuditValueValid = computed(() => {
  if (pendingStatus.value === 'rejected') return statusNotes.rejectionReason.trim().length >= 3
  if (pendingStatus.value === 'paid') return statusNotes.paymentReference.trim().length >= 2
  return true
})

const statusConfirmationDescription = computed(() => {
  const amount = form.amountDollars.trim() || '0.00'
  if (pendingStatus.value === 'rejected') {
    return `Reject ${form.title || 'this expense'} for $${amount}. The entered reason will be recorded in the audit trail.`
  }
  return `Mark ${form.title || 'this expense'} paid for $${amount}. The entered payment reference will be recorded in the audit trail.`
})

async function confirmExpenseStatus() {
  const status = pendingStatus.value
  if (!status) return
  await moveStatus(status)
  statusConfirmOpen.value = false
  pendingStatus.value = null
}

const availableTransitions = computed(() => {
  const status = selectedExpense.value?.status ?? 'draft'

  if (status === 'draft') return ['submitted'] as ExpenseStatus[]
  if (status === 'submitted') return ['approved', 'rejected'] as ExpenseStatus[]
  if (status === 'approved') return ['paid', 'rejected'] as ExpenseStatus[]
  if (status === 'rejected') return ['draft', 'submitted'] as ExpenseStatus[]
  return [] as ExpenseStatus[]
})

function confirmUnsavedNavigation() {
  if (!expenseDirty.value || !dashboardHydrated.value) return true
  return new Promise<boolean>((resolve) => {
    pendingDetailAction = () => resolve(true)
    pendingCancelAction = () => resolve(false)
    discardConfirmOpen.value = true
  })
}

onBeforeRouteUpdate(confirmUnsavedNavigation)
onBeforeRouteLeave(confirmUnsavedNavigation)

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!expenseDirty.value) return
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
    panel-id="admin-expenses"
    title="Expense Reports"
    :busy="pending"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: form.id ? 'Save expense' : 'Create expense',
          icon: 'i-lucide-save',
          loading: saving,
          disabled: !canMutate,
          onSelect: () => { void saveExpense() }
        }"
        :secondary="[
          {
            label: 'New expense',
            icon: 'i-lucide-receipt',
            color: 'neutral',
            variant: 'soft',
            disabled: !canMutate,
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

    <DashboardSectionState
      v-if="pending && !hasExpenseData"
      state="loading"
      title="Loading expense reports"
      description="Fetching expense, incident, member, and audit records."
    />
    <DashboardSectionState
      v-else-if="loadError && !hasExpenseData"
      state="error"
      title="Expense reports unavailable"
      :description="readErrorMessage(loadError)"
      show-retry
      @retry="refresh"
    />
    <DashboardSectionState
      v-else-if="loadError"
      state="error"
      color="warning"
      icon="i-lucide-clock-alert"
      title="Showing stale expense data"
      :description="`${readErrorMessage(loadError)} Mutations are disabled until refresh succeeds.`"
      show-retry
      @retry="refresh"
    />

    <template v-if="hasExpenseData">
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
        mobile-drawer
        :mobile-detail-open="mobileDetailOpen"
        mobile-detail-label="Expense details"
        @close-mobile-detail="closeMobileDetail"
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
              :aria-current="selectedExpenseId === expense.id ? 'true' : undefined"
              :aria-label="`Open expense ${expense.title}, ${formatMoney(expense.amountCents)}, ${expense.status}`"
              @click="selectExpense(expense)"
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
            <AppAlert
              v-if="expenseDirty"
              class="mb-3"
              color="warning"
              variant="soft"
              icon="i-lucide-pencil-line"
              title="Unsaved expense changes"
              description="Edited report fields are saved before a workflow transition. Audit notes are recorded only by reject or paid transitions."
            />
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="nextStatus in availableTransitions"
                :key="`transition-${nextStatus}`"
                size="xs"
                :color="statusColor(nextStatus)"
                variant="soft"
                :loading="updatingStatus"
                :disabled="!selectedExpense || !canMutate"
                @click="requestMoveStatus(nextStatus)"
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
              <UFormField
                v-if="availableTransitions.includes('rejected')"
                label="Rejection reason"
                description="Required when rejecting; stored in the expense audit."
                :error="pendingStatus === 'rejected' && !pendingAuditValueValid ? 'Enter at least 3 characters.' : undefined"
                required
              >
                <UTextarea
                  v-model="statusNotes.rejectionReason"
                  :rows="3"
                />
              </UFormField>
              <UFormField
                v-if="availableTransitions.includes('paid')"
                label="Payment reference"
                description="Required when marking paid; use the check, transfer, or transaction ID."
                :error="pendingStatus === 'paid' && !pendingAuditValueValid ? 'Enter a payment reference.' : undefined"
                required
              >
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

              <UFormField
                label="Amount (USD)"
                description="Converted to exact integer cents when saved."
                required
              >
                <UFieldGroup>
                  <UBadge
                    color="neutral"
                    variant="outline"
                  >
                    $
                  </UBadge>
                  <UInput
                    v-model="form.amountDollars"
                    type="text"
                    inputmode="decimal"
                    placeholder="125.00"
                  />
                </UFieldGroup>
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
              <div
                v-if="selectedExpense.rejectionReason"
                class="md:col-span-2"
              >
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Rejection audit
                </div>
                <div class="mt-1 text-sm text-toned">
                  {{ selectedExpense.rejectionReason }}
                </div>
              </div>
              <div
                v-if="selectedExpense.paymentReference"
                class="md:col-span-2"
              >
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Payment reference
                </div>
                <div class="mt-1 text-sm text-toned">
                  {{ selectedExpense.paymentReference }}
                </div>
              </div>
            </div>
          </UCard>
        </template>
      </DashboardDataPanel>
    </template>

    <ConfirmDialog
      v-model:open="discardConfirmOpen"
      title="Discard unsaved expense changes?"
      description="The current expense fields or audit notes have not been persisted. This action cannot restore those edits."
      confirm-label="Discard changes"
      color="error"
      @confirm="confirmDiscardChanges"
      @cancel="cancelDiscardChanges"
    />

    <ConfirmDialog
      v-model:open="statusConfirmOpen"
      :title="pendingStatus === 'rejected' ? 'Reject this expense?' : 'Mark this expense paid?'"
      :description="statusConfirmationDescription"
      :confirm-label="pendingStatus === 'rejected' ? 'Save and reject' : 'Save and mark paid'"
      :color="pendingStatus === 'rejected' ? 'error' : 'primary'"
      :busy="updatingStatus || saving"
      :disabled="!pendingAuditValueValid"
      @confirm="confirmExpenseStatus"
      @cancel="pendingStatus = null"
    />
  </DashboardPageScaffold>
</template>
