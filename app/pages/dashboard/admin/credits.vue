<script setup lang="ts">
import { formatCentsForUsdInput, parseUsdInputToCents } from '~/utils/adminMoney'
import { adminDatetimeInputToIso, isoToAdminDatetimeInput } from '~/utils/adminTime'

definePageMeta({ middleware: ['admin'] })

type CreditOption = {
  id: string
  key: string
  label: string
  description: string | null
  credits: number
  base_price_cents: number
  sale_price_cents: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  active: boolean
  sort_order: number
  square_item_id: string | null
  square_variation_id: string | null
}

type ReferralRuleForm = {
  tierId: string
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  referrerCredits: number
  referredCredits: number
}

type CreditSettingsPayload = {
  creditExpiryDays: number
  creditRolloverMaxMultiplier: number
  workshopCreditMultiplier: number
  referralRules?: ReferralRuleForm[]
}

const toast = useToast()
const selectedId = ref<string | null>(null)
const savingAndSyncing = ref(false)
const deleting = ref(false)
const reconcilingTopups = ref(false)
const savingCreditPolicy = ref(false)
const reordering = ref(false)
const draggedOptionId = ref<string | null>(null)
const activeCreditsTab = ref('catalog')
const pending = ref(false)
const loadingCreditPolicy = ref(false)
const optionRows = ref<CreditOption[]>([])
const optionsLoaded = ref(false)
const optionsError = ref<string | null>(null)
const creditPolicyLoaded = ref(false)
const creditPolicyError = ref<string | null>(null)
const dashboardHydrated = ref(false)
const deleteConfirmOpen = ref(false)

const creditPolicy = reactive({
  creditExpiryDays: 90,
  creditRolloverMaxMultiplier: 2,
  workshopCreditMultiplier: 2,
  referralRules: [] as ReferralRuleForm[]
})

function centsToDollars(cents: number | null | undefined) {
  return formatCentsForUsdInput(cents)
}

const form = reactive({
  id: '' as string,
  key: '',
  label: '',
  description: '',
  credits: 1,
  basePriceDollars: '40.00',
  salePriceDollars: '' as string,
  saleStartsAt: null as string | null,
  saleEndsAt: null as string | null,
  active: true,
  sortOrder: 1
})

const cadenceOptions = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Annual', value: 'annual' }
]

const options = computed(() => optionRows.value)
const pageLoading = computed(() => pending.value || loadingCreditPolicy.value)
const hasAllData = computed(() => optionsLoaded.value && creditPolicyLoaded.value)
const canMutateOptions = computed(() =>
  dashboardHydrated.value
  && optionsLoaded.value
  && !pending.value
  && !optionsError.value
)
const canMutateCreditPolicy = computed(() =>
  dashboardHydrated.value
  && creditPolicyLoaded.value
  && !loadingCreditPolicy.value
  && !creditPolicyError.value
)
const reorderedOptions = ref<CreditOption[]>([])
const selectedOption = computed(() => options.value.find(option => option.id === selectedId.value) ?? null)
const activeOptionCount = computed(() => options.value.filter(option => option.active).length)
const syncedOptionCount = computed(() =>
  options.value.filter(option => option.square_item_id && option.square_variation_id).length
)
const discountedOptionCount = computed(() => options.value.filter(option => option.sale_price_cents !== null).length)
const referralRuleCount = computed(() =>
  creditPolicy.referralRules.filter(rule => String(rule.tierId ?? '').trim()).length
)
const creditTabs = computed(() => [
  {
    label: 'Catalog',
    value: 'catalog',
    icon: 'i-lucide-wallet-cards',
    badge: options.value.length
  },
  {
    label: 'Policy',
    value: 'policy',
    icon: 'i-lucide-sliders-horizontal'
  },
  {
    label: 'Referrals',
    value: 'referrals',
    icon: 'i-lucide-gift',
    badge: referralRuleCount.value
  },
  {
    label: 'Maintenance',
    value: 'maintenance',
    icon: 'i-lucide-wrench'
  }
])

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function applyCreditPolicySettings(settings: CreditSettingsPayload) {
  creditPolicy.creditExpiryDays = Number(settings.creditExpiryDays ?? 90)
  creditPolicy.creditRolloverMaxMultiplier = Number(settings.creditRolloverMaxMultiplier ?? 2)
  creditPolicy.workshopCreditMultiplier = Number(settings.workshopCreditMultiplier ?? 2)
  creditPolicy.referralRules = Array.isArray(settings.referralRules)
    ? settings.referralRules.map(rule => ({
        tierId: String(rule.tierId ?? ''),
        cadence: rule.cadence,
        referrerCredits: Number(rule.referrerCredits ?? 0),
        referredCredits: Number(rule.referredCredits ?? 0)
      }))
    : []
}

async function refresh() {
  pending.value = true
  optionsError.value = null
  try {
    const res = await $fetch<{ options: CreditOption[] }>('/api/admin/credits/options')
    optionRows.value = Array.isArray(res.options) ? res.options : []
    optionsLoaded.value = true
  } catch (error: unknown) {
    optionsError.value = readErrorMessage(error)
    toast.add({
      title: 'Could not load credit options',
      description: optionsError.value,
      color: 'error'
    })
  } finally {
    pending.value = false
  }
}

async function refreshCreditPolicy() {
  loadingCreditPolicy.value = true
  creditPolicyError.value = null
  try {
    const res = await $fetch<{ settings: CreditSettingsPayload }>('/api/admin/credits/settings')
    applyCreditPolicySettings(res.settings)
    creditPolicyLoaded.value = true
  } catch (error: unknown) {
    creditPolicyError.value = readErrorMessage(error)
    toast.add({
      title: 'Could not load credit settings',
      description: creditPolicyError.value,
      color: 'error'
    })
  } finally {
    loadingCreditPolicy.value = false
  }
}

function addReferralRule() {
  if (!canMutateCreditPolicy.value) return
  creditPolicy.referralRules.push({
    tierId: '',
    cadence: 'monthly',
    referrerCredits: 1,
    referredCredits: 1
  })
}

function removeReferralRule(index: number) {
  if (!canMutateCreditPolicy.value) return
  creditPolicy.referralRules.splice(index, 1)
}

async function refreshCreditsPage() {
  await Promise.all([
    refresh(),
    refreshCreditPolicy()
  ])
}

function formatCredits(value: number | null | undefined) {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return '0'
  return Number.isInteger(parsed) ? parsed.toString() : parsed.toFixed(2).replace(/\.?0+$/, '')
}

function resetForm() {
  selectedId.value = null
  form.id = ''
  form.key = ''
  form.label = ''
  form.description = ''
  form.credits = 1
  form.basePriceDollars = '40.00'
  form.salePriceDollars = ''
  form.saleStartsAt = null
  form.saleEndsAt = null
  form.active = true
  form.sortOrder = 1
}

function startNewOption() {
  if (!canMutateOptions.value) return
  activeCreditsTab.value = 'catalog'
  resetForm()
}

function loadOption(optionId: string) {
  if (!optionsLoaded.value) return
  const option = options.value.find(row => row.id === optionId)
  if (!option) return
  selectedId.value = option.id
  form.id = option.id
  form.key = option.key
  form.label = option.label
  form.description = option.description ?? ''
  form.credits = Number(option.credits)
  form.basePriceDollars = centsToDollars(option.base_price_cents)
  form.salePriceDollars = option.sale_price_cents === null ? '' : centsToDollars(option.sale_price_cents)
  form.saleStartsAt = option.sale_starts_at
  form.saleEndsAt = option.sale_ends_at
  form.active = option.active
  form.sortOrder = Number(option.sort_order ?? 0)
}

watch(options, (next) => {
  reorderedOptions.value = [...next]
  if (!next.length) return
  if (!selectedId.value) {
    loadOption(next[0]!.id)
    return
  }
  const stillExists = next.find(row => row.id === selectedId.value)
  if (!stillExists) loadOption(next[0]!.id)
}, { immediate: true })

onMounted(() => {
  dashboardHydrated.value = true
  void refreshCreditsPage()
})

function buildOptionReorderPayload(rows: CreditOption[]) {
  return rows.map((option, index) => ({
    id: option.id,
    sortOrder: (index + 1) * 10
  }))
}

async function persistOptionReorder(nextOptions: CreditOption[]) {
  if (!canMutateOptions.value || !nextOptions.length) return
  reordering.value = true
  try {
    await $fetch('/api/admin/credits/options.reorder', {
      method: 'POST',
      body: {
        options: buildOptionReorderPayload(nextOptions)
      }
    })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save option order',
      description: readErrorMessage(error),
      color: 'error'
    })
    reorderedOptions.value = [...options.value]
  } finally {
    reordering.value = false
  }
}

function onOptionDragStart(event: DragEvent, optionId: string) {
  draggedOptionId.value = optionId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', optionId)
  }
}

function onOptionDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

async function onOptionDrop(event: DragEvent, targetOptionId: string) {
  event.preventDefault()
  const sourceOptionId = event.dataTransfer?.getData('text/plain') || draggedOptionId.value
  draggedOptionId.value = null
  if (!sourceOptionId || sourceOptionId === targetOptionId) return

  const nextOrder = [...reorderedOptions.value]
  const fromIndex = nextOrder.findIndex(option => option.id === sourceOptionId)
  const toIndex = nextOrder.findIndex(option => option.id === targetOptionId)
  if (fromIndex < 0 || toIndex < 0) return

  const [moved] = nextOrder.splice(fromIndex, 1)
  if (!moved) return
  nextOrder.splice(toIndex, 0, moved)
  reorderedOptions.value = nextOrder
  await persistOptionReorder(nextOrder)
}

async function moveOption(optionId: string, direction: -1 | 1) {
  if (!canMutateOptions.value) return
  const nextOrder = [...reorderedOptions.value]
  const fromIndex = nextOrder.findIndex(option => option.id === optionId)
  const toIndex = fromIndex + direction
  if (fromIndex < 0 || toIndex < 0 || toIndex >= nextOrder.length) return
  const [moved] = nextOrder.splice(fromIndex, 1)
  if (!moved) return
  nextOrder.splice(toIndex, 0, moved)
  reorderedOptions.value = nextOrder
  await persistOptionReorder(nextOrder)
}

function onOptionKeydown(event: KeyboardEvent, optionId: string) {
  if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  event.preventDefault()
  void moveOption(optionId, event.key === 'ArrowUp' ? -1 : 1)
}

function onOptionDragEnd() {
  draggedOptionId.value = null
}

async function saveAndSyncSquare() {
  if (!canMutateOptions.value) return
  savingAndSyncing.value = true
  try {
    const basePriceCents = parseUsdInputToCents(form.basePriceDollars)
    if (basePriceCents === null || basePriceCents <= 0) {
      toast.add({
        title: 'Invalid base price',
        description: 'Base price must be a dollar amount with up to 2 decimal places.',
        color: 'error'
      })
      return
    }

    const salePriceCents = form.salePriceDollars.trim() ? parseUsdInputToCents(form.salePriceDollars) : null
    if (form.salePriceDollars.trim() && (salePriceCents === null || salePriceCents <= 0)) {
      toast.add({
        title: 'Invalid sale price',
        description: 'Sale price must be blank or a dollar amount with up to 2 decimal places.',
        color: 'error'
      })
      return
    }

    const upsertRes = await $fetch<{ option: { id: string } }>('/api/admin/credits/options.upsert', {
      method: 'POST',
      body: {
        id: form.id || undefined,
        key: form.key,
        label: form.label,
        description: form.description.trim() || null,
        credits: form.credits,
        basePriceCents,
        salePriceCents,
        saleStartsAt: form.saleStartsAt,
        saleEndsAt: form.saleEndsAt,
        active: form.active,
        sortOrder: form.sortOrder
      }
    })

    const optionId = upsertRes.option.id
    form.id = optionId
    selectedId.value = optionId

    await $fetch('/api/admin/credits/options.sync-square', {
      method: 'POST',
      body: { id: optionId }
    })
    toast.add({ title: 'Saved' })
    await refresh()
    loadOption(optionId)
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingAndSyncing.value = false
  }
}

function requestDeleteOption() {
  if (!form.id) {
    toast.add({ title: 'Select a credit option first', color: 'warning' })
    return
  }
  if (!canMutateOptions.value) return
  deleteConfirmOpen.value = true
}

async function deleteOption() {
  if (!form.id || !canMutateOptions.value) return
  deleting.value = true
  try {
    await $fetch('/api/admin/credits/options.delete', {
      method: 'POST',
      body: { id: form.id }
    })
    toast.add({ title: 'Credit option deleted' })
    deleteConfirmOpen.value = false
    resetForm()
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not delete option',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}

async function reconcilePendingTopups() {
  if (!canMutateOptions.value) return
  reconcilingTopups.value = true
  try {
    const res = await $fetch<{
      scanned: number
      processed: number
      stillPending: number
      failed: number
    }>('/api/admin/credits/topups.reconcile', {
      method: 'POST',
      body: {}
    })
    toast.add({
      title: 'Top-up reconciliation complete',
      description: `Scanned ${res.scanned}. Processed ${res.processed}, still pending ${res.stillPending}, failed ${res.failed}.`
    })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not reconcile top-ups',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    reconcilingTopups.value = false
  }
}

async function saveCreditPolicy() {
  if (!canMutateCreditPolicy.value) return
  savingCreditPolicy.value = true
  try {
    const referralRules = creditPolicy.referralRules
      .map(rule => ({
        tierId: String(rule.tierId ?? '').trim(),
        cadence: rule.cadence,
        referrerCredits: Number(rule.referrerCredits ?? 0),
        referredCredits: Number(rule.referredCredits ?? 0)
      }))
      .filter(rule => rule.tierId)

    await $fetch('/api/admin/credits/settings.upsert', {
      method: 'POST',
      body: {
        creditExpiryDays: creditPolicy.creditExpiryDays,
        creditRolloverMaxMultiplier: creditPolicy.creditRolloverMaxMultiplier,
        workshopCreditMultiplier: creditPolicy.workshopCreditMultiplier,
        referralRules
      }
    })
    toast.add({ title: 'Credit policy saved' })
    await refreshCreditPolicy()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save credit policy',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingCreditPolicy.value = false
  }
}
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-credits"
    title="Credits"
    :busy="pageLoading"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: 'New option',
          icon: 'i-lucide-plus',
          disabled: !canMutateOptions,
          onSelect: startNewOption
        }"
        :secondary="[
          {
            label: 'Refresh',
            icon: 'i-lucide-refresh-cw',
            color: 'neutral',
            variant: 'soft',
            loading: pageLoading,
            onSelect: refreshCreditsPage
          }
        ]"
      />
    </template>

    <DashboardSectionState
      v-if="(!optionsLoaded && pending) || (!creditPolicyLoaded && loadingCreditPolicy)"
      state="loading"
      title="Loading credit operations"
      description="Loading the top-up catalog and credit policy before actions are enabled."
    />
    <DashboardSectionState
      v-else-if="(!optionsLoaded && optionsError) || (!creditPolicyLoaded && creditPolicyError)"
      state="error"
      title="Credit operations are unavailable"
      :description="optionsError || creditPolicyError"
      show-retry
      @retry="refreshCreditsPage"
    />
    <AppAlert
      v-else-if="optionsError || creditPolicyError"
      color="warning"
      variant="soft"
      icon="i-lucide-database-zap"
      title="Showing stale credit data"
      :description="optionsError || creditPolicyError || undefined"
    />

    <div
      v-if="hasAllData"
      class="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
    >
      <UCard class="admin-panel-card border-0">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-dimmed">
              Catalog
            </p>
            <div class="mt-2 text-2xl font-semibold">
              {{ activeOptionCount }} / {{ options.length }}
            </div>
            <p class="mt-1 text-xs text-dimmed">
              active top-up options
            </p>
          </div>
          <UIcon
            name="i-lucide-wallet-cards"
            class="size-5 text-dimmed"
          />
        </div>
      </UCard>

      <UCard class="admin-panel-card border-0">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-dimmed">
              Square
            </p>
            <div class="mt-2 text-2xl font-semibold">
              {{ syncedOptionCount }} / {{ options.length }}
            </div>
            <p class="mt-1 text-xs text-dimmed">
              options synced
            </p>
          </div>
          <UIcon
            name="i-lucide-store"
            class="size-5 text-dimmed"
          />
        </div>
      </UCard>

      <UCard class="admin-panel-card border-0">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-dimmed">
              Discounts
            </p>
            <div class="mt-2 text-2xl font-semibold">
              {{ discountedOptionCount }}
            </div>
            <p class="mt-1 text-xs text-dimmed">
              sale prices configured
            </p>
          </div>
          <UIcon
            name="i-lucide-badge-percent"
            class="size-5 text-dimmed"
          />
        </div>
      </UCard>

      <UCard class="admin-panel-card border-0">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-dimmed">
              Referrals
            </p>
            <div class="mt-2 text-2xl font-semibold">
              {{ referralRuleCount }}
            </div>
            <p class="mt-1 text-xs text-dimmed">
              reward rules
            </p>
          </div>
          <UIcon
            name="i-lucide-gift"
            class="size-5 text-dimmed"
          />
        </div>
      </UCard>
    </div>

    <div
      v-if="optionsLoaded || creditPolicyLoaded"
      class="space-y-4"
    >
      <UTabs
        v-model="activeCreditsTab"
        :items="creditTabs"
        :content="false"
        color="primary"
        variant="pill"
        class="w-full"
      />

      <div
        v-if="activeCreditsTab === 'catalog' && optionsLoaded"
        class="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]"
      >
        <UCard class="admin-panel-card border-0">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">
                  Top-up catalog
                </div>
                <div class="text-xs text-dimmed">
                  Drag to reorder checkout display.
                </div>
              </div>
              <UBadge
                color="neutral"
                variant="soft"
              >
                {{ reordering ? 'Saving order' : `${options.length} options` }}
              </UBadge>
            </div>
          </template>

          <DashboardSectionState
            v-if="!reorderedOptions.length"
            state="empty"
            title="No credit options"
            description="Create the first top-up option to enable member credit purchases."
          />

          <div
            v-else
            class="space-y-2"
          >
            <button
              v-for="option in reorderedOptions"
              :key="option.id"
              class="w-full rounded-lg border border-default p-3 text-left text-sm transition hover:bg-elevated"
              :class="selectedId === option.id ? 'border-primary bg-elevated' : ''"
              :draggable="canMutateOptions"
              :aria-pressed="selectedId === option.id"
              :aria-label="`${option.label}. Press Alt plus Up or Down Arrow to reorder.`"
              @dragstart="onOptionDragStart($event, option.id)"
              @dragover="onOptionDragOver"
              @drop="onOptionDrop($event, option.id)"
              @dragend="onOptionDragEnd"
              @click="loadOption(option.id)"
              @keydown="onOptionKeydown($event, option.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex min-w-0 items-center gap-2">
                    <UIcon
                      name="i-lucide-grip-vertical"
                      class="size-4 shrink-0 text-dimmed"
                    />
                    <span class="truncate font-medium">
                      {{ option.label }}
                    </span>
                  </div>
                  <div class="mt-1 truncate pl-6 text-xs text-dimmed">
                    {{ option.key }}
                  </div>
                </div>
                <div class="shrink-0 text-right">
                  <UBadge
                    :color="option.active ? 'success' : 'neutral'"
                    size="xs"
                    variant="soft"
                  >
                    {{ option.active ? 'Active' : 'Inactive' }}
                  </UBadge>
                  <div class="mt-1 text-xs text-dimmed">
                    {{ formatCredits(option.credits) }} cr / ${{ centsToDollars(option.sale_price_cents ?? option.base_price_cents) }}
                  </div>
                </div>
              </div>
            </button>
          </div>
        </UCard>

        <UCard class="admin-panel-card border-0">
          <template #header>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="font-medium">
                  {{ selectedId ? 'Edit credit option' : 'New credit option' }}
                </div>
                <div class="text-xs text-dimmed">
                  Save updates locally, then sync the matching Square item.
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  v-if="selectedOption"
                  :color="selectedOption.square_item_id ? 'success' : 'warning'"
                  variant="soft"
                >
                  {{ selectedOption.square_item_id ? 'Square connected' : 'Square missing' }}
                </UBadge>
                <UBadge
                  :color="form.active ? 'success' : 'neutral'"
                  variant="soft"
                >
                  {{ form.active ? 'Active' : 'Inactive' }}
                </UBadge>
              </div>
            </div>
          </template>

          <div class="space-y-6">
            <section class="space-y-3">
              <div>
                <div class="text-sm font-medium">
                  Identity
                </div>
                <div class="text-xs text-dimmed">
                  Member-facing name and internal key.
                </div>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Key">
                  <UInput
                    v-model="form.key"
                    placeholder="bundle_5"
                  />
                </UFormField>
                <UFormField label="Label">
                  <UInput
                    v-model="form.label"
                    placeholder="5 credits"
                  />
                </UFormField>
                <UFormField
                  label="Description"
                  class="md:col-span-2"
                >
                  <UInput
                    v-model="form.description"
                    placeholder="Five-credit bundle"
                  />
                </UFormField>
              </div>
            </section>

            <USeparator />

            <section class="space-y-3">
              <div>
                <div class="text-sm font-medium">
                  Pricing
                </div>
                <div class="text-xs text-dimmed">
                  Credits granted and optional sale window.
                </div>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Credits">
                  <UInput
                    v-model.number="form.credits"
                    type="number"
                    min="0.25"
                    step="0.25"
                  />
                </UFormField>
                <UFormField label="Base price (USD)">
                  <UInput
                    v-model="form.basePriceDollars"
                    type="text"
                    inputmode="decimal"
                    placeholder="40.00"
                  />
                </UFormField>
                <UFormField label="Sale price (USD)">
                  <UInput
                    v-model="form.salePriceDollars"
                    type="text"
                    inputmode="decimal"
                    placeholder="Optional"
                  />
                </UFormField>
                <UFormField label="Sort order">
                  <UInput
                    v-model.number="form.sortOrder"
                    type="number"
                    :disabled="reordering"
                  />
                </UFormField>
                <UFormField label="Sale starts">
                  <UInput
                    :model-value="isoToAdminDatetimeInput(form.saleStartsAt)"
                    type="datetime-local"
                    @update:model-value="(value) => { form.saleStartsAt = adminDatetimeInputToIso(String(value ?? '')) }"
                  />
                </UFormField>
                <UFormField label="Sale ends">
                  <UInput
                    :model-value="isoToAdminDatetimeInput(form.saleEndsAt)"
                    type="datetime-local"
                    @update:model-value="(value) => { form.saleEndsAt = adminDatetimeInputToIso(String(value ?? '')) }"
                  />
                </UFormField>
              </div>
            </section>

            <USeparator />

            <section class="flex flex-wrap items-center justify-between gap-3">
              <UCheckbox
                v-model="form.active"
                label="Visible to members"
              />
              <DashboardActionGroup
                :secondary="[
                  {
                    label: 'Delete',
                    icon: 'i-lucide-trash-2',
                    color: 'error',
                    variant: 'soft',
                    loading: deleting,
                    disabled: !form.id || !canMutateOptions,
                    onSelect: requestDeleteOption
                  }
                ]"
                :primary="{
                  label: 'Save and sync',
                  icon: 'i-lucide-cloud-upload',
                  loading: savingAndSyncing,
                  disabled: !canMutateOptions,
                  onSelect: saveAndSyncSquare
                }"
              />
            </section>
          </div>
        </UCard>
      </div>

      <UCard
        v-else-if="activeCreditsTab === 'policy' && creditPolicyLoaded"
        class="admin-panel-card border-0 max-w-4xl"
      >
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-medium">
                Credit policy
              </div>
              <div class="text-xs text-dimmed">
                Expiration, rollover, and workshop burn rate.
              </div>
            </div>
            <UButton
              size="sm"
              :loading="savingCreditPolicy || loadingCreditPolicy"
              :disabled="!canMutateCreditPolicy"
              @click="saveCreditPolicy"
            >
              Save policy
            </UButton>
          </div>
        </template>

        <div class="grid gap-3 md:grid-cols-3">
          <UFormField
            label="Credit expiration"
            description="Days before unused top-up credits expire."
          >
            <UInput
              v-model.number="creditPolicy.creditExpiryDays"
              type="number"
              min="0"
            />
          </UFormField>
          <UFormField
            label="Rollover max"
            description="Maximum rollover multiplier for plan credits."
          >
            <UInput
              v-model.number="creditPolicy.creditRolloverMaxMultiplier"
              type="number"
              step="0.25"
              min="0.5"
            />
          </UFormField>
          <UFormField
            label="Workshop multiplier"
            description="Credit burn multiplier for workshop bookings."
          >
            <UInput
              v-model.number="creditPolicy.workshopCreditMultiplier"
              type="number"
              step="0.25"
              min="1"
            />
          </UFormField>
        </div>
      </UCard>

      <UCard
        v-else-if="activeCreditsTab === 'referrals' && creditPolicyLoaded"
        class="admin-panel-card border-0"
      >
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="font-medium">
                Referral rewards
              </div>
              <div class="text-xs text-dimmed">
                Credits granted to both accounts after the new member's first paid claim.
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-plus"
                :disabled="!canMutateCreditPolicy"
                @click="addReferralRule"
              >
                Add rule
              </UButton>
              <UButton
                size="sm"
                :loading="savingCreditPolicy || loadingCreditPolicy"
                :disabled="!canMutateCreditPolicy"
                @click="saveCreditPolicy"
              >
                Save rewards
              </UButton>
            </div>
          </div>
        </template>

        <DashboardSectionState
          v-if="!creditPolicy.referralRules.length"
          state="empty"
          title="No referral rules"
          description="Add a tier and cadence rule to control referral credits."
        />

        <div
          v-else
          class="space-y-3"
        >
          <div
            v-for="(rule, index) in creditPolicy.referralRules"
            :key="`${rule.tierId}-${rule.cadence}-${index}`"
            class="rounded-xl border border-default bg-elevated/30 p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    color="neutral"
                    variant="soft"
                  >
                    Rule {{ index + 1 }}
                  </UBadge>
                  <span class="text-sm font-medium">
                    {{ rule.tierId || 'Unassigned tier' }}
                  </span>
                </div>
                <div class="mt-1 text-xs text-dimmed">
                  {{ rule.cadence }} cadence · {{ formatCredits(rule.referrerCredits) }} / {{ formatCredits(rule.referredCredits) }} credits
                </div>
              </div>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-trash-2"
                :disabled="!canMutateCreditPolicy"
                :aria-label="`Remove referral rule ${index + 1}`"
                @click="removeReferralRule(index)"
              >
                Remove
              </UButton>
            </div>

            <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div class="grid gap-3 md:grid-cols-2">
                <UFormField
                  label="Tier ID"
                  description="Membership tier this reward applies to."
                >
                  <UInput
                    v-model="rule.tierId"
                    placeholder="tier id"
                  />
                </UFormField>
                <UFormField
                  label="Billing cadence"
                  description="Plan cadence for the reward rule."
                >
                  <USelect
                    v-model="rule.cadence"
                    :items="cadenceOptions"
                  />
                </UFormField>
              </div>

              <div class="rounded-lg border border-default bg-default/60 p-3">
                <div class="text-xs font-medium uppercase tracking-wide text-dimmed">
                  Awarded credits
                </div>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <UFormField label="Referrer">
                    <UInput
                      v-model.number="rule.referrerCredits"
                      type="number"
                      min="0"
                      step="0.25"
                    />
                  </UFormField>
                  <UFormField label="New member">
                    <UInput
                      v-model.number="rule.referredCredits"
                      type="number"
                      min="0"
                      step="0.25"
                    />
                  </UFormField>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <UCard
        v-else-if="activeCreditsTab === 'maintenance' && optionsLoaded"
        class="admin-panel-card border-0 max-w-3xl"
      >
        <template #header>
          <div>
            <div class="font-medium">
              Maintenance
            </div>
            <div class="text-xs text-dimmed">
              One-off actions for top-up reconciliation.
            </div>
          </div>
        </template>

        <div class="space-y-3">
          <div class="text-sm text-dimmed">
            Reconcile completed Square top-up sessions that are still marked pending.
          </div>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-rotate-cw"
            :loading="reconcilingTopups"
            :disabled="!canMutateOptions"
            @click="reconcilePendingTopups"
          >
            Reconcile top-ups
          </UButton>
        </div>
      </UCard>
    </div>

    <ConfirmDialog
      v-model:open="deleteConfirmOpen"
      title="Delete credit option?"
      :description="`Delete ${form.label || form.key || 'this credit option'} from the catalog and remove its linked Square item. This cannot be undone.`"
      confirm-label="Delete option"
      busy-label="Deleting option"
      color="error"
      :busy="deleting"
      :disabled="!canMutateOptions"
      @confirm="deleteOption"
    />
  </DashboardPageScaffold>
</template>
