<script setup lang="ts">
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

const toast = useToast()
const selectedId = ref<string | null>(null)
const savingAndSyncing = ref(false)
const deleting = ref(false)
const reconcilingTopups = ref(false)
const savingCreditPolicy = ref(false)

const creditPolicy = reactive({
  creditExpiryDays: 90,
  creditRolloverMaxMultiplier: 2
})

const form = reactive({
  id: '' as string,
  key: '',
  label: '',
  description: '',
  credits: 1,
  basePriceCents: 4000,
  salePriceCents: null as number | null,
  saleStartsAt: null as string | null,
  saleEndsAt: null as string | null,
  active: true,
  sortOrder: 1
})

const { data: optionRows, refresh, pending } = await useAsyncData('admin:credits:options', async () => {
  const res = await $fetch<{ options: CreditOption[] }>('/api/admin/credits/options')
  return res.options
})

const { refresh: refreshCreditPolicy } = await useAsyncData('admin:credits:settings', async () => {
  const res = await $fetch<{ settings: { creditExpiryDays: number, creditRolloverMaxMultiplier: number } }>('/api/admin/credits/settings')
  creditPolicy.creditExpiryDays = Number(res.settings.creditExpiryDays ?? 90)
  creditPolicy.creditRolloverMaxMultiplier = Number(res.settings.creditRolloverMaxMultiplier ?? 2)
  return res.settings
})

const options = computed(() => optionRows.value ?? [])

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function toLocalInputValue(value: string | null) {
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

function resetForm() {
  selectedId.value = null
  form.id = ''
  form.key = ''
  form.label = ''
  form.description = ''
  form.credits = 1
  form.basePriceCents = 4000
  form.salePriceCents = null
  form.saleStartsAt = null
  form.saleEndsAt = null
  form.active = true
  form.sortOrder = 1
}

function loadOption(optionId: string) {
  const option = options.value.find(row => row.id === optionId)
  if (!option) return
  selectedId.value = option.id
  form.id = option.id
  form.key = option.key
  form.label = option.label
  form.description = option.description ?? ''
  form.credits = Number(option.credits)
  form.basePriceCents = Number(option.base_price_cents)
  form.salePriceCents = option.sale_price_cents === null ? null : Number(option.sale_price_cents)
  form.saleStartsAt = option.sale_starts_at
  form.saleEndsAt = option.sale_ends_at
  form.active = option.active
  form.sortOrder = Number(option.sort_order ?? 0)
}

watch(options, (next) => {
  if (!next.length) return
  if (!selectedId.value) {
    loadOption(next[0]!.id)
    return
  }
  const stillExists = next.find(row => row.id === selectedId.value)
  if (!stillExists) loadOption(next[0]!.id)
}, { immediate: true })

async function saveAndSyncSquare() {
  savingAndSyncing.value = true
  try {
    const upsertRes = await $fetch<{ option: { id: string } }>('/api/admin/credits/options.upsert', {
      method: 'POST',
      body: {
        id: form.id || undefined,
        key: form.key,
        label: form.label,
        description: form.description.trim() || null,
        credits: form.credits,
        basePriceCents: form.basePriceCents,
        salePriceCents: form.salePriceCents,
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
    toast.add({ title: 'Saved and synced to Square' })
    await refresh()
    loadOption(optionId)
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save and sync',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingAndSyncing.value = false
  }
}

async function deleteOption() {
  if (!form.id) {
    toast.add({ title: 'Select a credit option first', color: 'warning' })
    return
  }

  const confirmed = window.confirm('Delete this credit option? This will remove the linked Square item and delete the option from the database.')
  if (!confirmed) return

  deleting.value = true
  try {
    await $fetch('/api/admin/credits/options.delete', {
      method: 'POST',
      body: { id: form.id }
    })
    toast.add({ title: 'Credit option deleted' })
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
  savingCreditPolicy.value = true
  try {
    await $fetch('/api/admin/credits/settings.upsert', {
      method: 'POST',
      body: {
        creditExpiryDays: creditPolicy.creditExpiryDays,
        creditRolloverMaxMultiplier: creditPolicy.creditRolloverMaxMultiplier
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
  <UDashboardPanel id="admin-credits">
    <template #header>
      <UDashboardNavbar title="Credits Handler" :ui="{ right: 'gap-2' }">
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
          icon="i-lucide-wallet-cards"
          title="Credits catalog management"
          description="Configure top-up options, run timed discounts, and sync each option to a Square catalog item."
        />

        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="font-medium">Top-up reconciliation</div>
              <div class="text-sm text-dimmed">
                Claims any completed Square top-up sessions still marked pending.
              </div>
            </div>
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-rotate-cw"
              :loading="reconcilingTopups"
              @click="reconcilePendingTopups"
            >
              Reconcile pending top-ups
            </UButton>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="font-medium">Credit lifecycle settings</div>
              <div class="text-sm text-dimmed">
                Configure expiration and maximum rollover cap used by monthly grant processing.
              </div>
            </div>
            <UButton :loading="savingCreditPolicy" @click="saveCreditPolicy">
              Save policy
            </UButton>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-2">
            <UFormField label="Credit expiration (days)">
              <UInput v-model.number="creditPolicy.creditExpiryDays" type="number" min="0" />
            </UFormField>
            <UFormField label="Rollover max multiplier">
              <UInput v-model.number="creditPolicy.creditRolloverMaxMultiplier" type="number" step="0.25" min="0.5" />
            </UFormField>
          </div>
        </UCard>

        <div class="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <UCard>
            <div class="flex items-center justify-between">
              <div class="font-medium">
                Credit options
              </div>
              <UButton size="xs" color="neutral" variant="soft" @click="resetForm">
                New option
              </UButton>
            </div>
            <div class="mt-3 space-y-2">
              <button
                v-for="option in options"
                :key="option.id"
                class="w-full rounded-lg border border-default p-2 text-left text-sm transition hover:bg-elevated"
                :class="selectedId === option.id ? 'border-primary bg-elevated' : ''"
                @click="loadOption(option.id)"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium">{{ option.label }}</span>
                  <UBadge :color="option.active ? 'success' : 'neutral'" size="xs" variant="soft">
                    {{ option.active ? 'active' : 'inactive' }}
                  </UBadge>
                </div>
                <div class="mt-1 text-xs text-dimmed">
                  {{ option.key }}
                </div>
              </button>
            </div>
          </UCard>

          <UCard>
            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Key">
                <UInput v-model="form.key" placeholder="bundle_5" />
              </UFormField>
              <UFormField label="Label">
                <UInput v-model="form.label" placeholder="5 credits" />
              </UFormField>
              <UFormField label="Description" class="md:col-span-2">
                <UInput v-model="form.description" placeholder="Five-credit bundle" />
              </UFormField>
              <UFormField label="Credits">
                <UInput v-model.number="form.credits" type="number" min="0.25" step="0.25" />
              </UFormField>
              <UFormField label="Base price (cents)">
                <UInput v-model.number="form.basePriceCents" type="number" min="1" />
              </UFormField>
              <UFormField label="Sale price (cents)">
                <UInput v-model.number="form.salePriceCents" type="number" min="1" />
              </UFormField>
              <UFormField label="Sort order">
                <UInput v-model.number="form.sortOrder" type="number" />
              </UFormField>
              <UFormField label="Sale starts">
                <UInput
                  :model-value="toLocalInputValue(form.saleStartsAt)"
                  type="datetime-local"
                  @update:model-value="(value) => { form.saleStartsAt = fromLocalInputValue(String(value ?? '')) }"
                />
              </UFormField>
              <UFormField label="Sale ends">
                <UInput
                  :model-value="toLocalInputValue(form.saleEndsAt)"
                  type="datetime-local"
                  @update:model-value="(value) => { form.saleEndsAt = fromLocalInputValue(String(value ?? '')) }"
                />
              </UFormField>
            </div>

            <div class="mt-4 flex items-center gap-4">
              <UCheckbox v-model="form.active" label="Active" />
            </div>

            <div
              v-if="selectedId"
              class="mt-3 text-xs text-dimmed"
            >
              Square link:
              {{
                options.find(option => option.id === selectedId)?.square_item_id
                  ? 'Connected'
                  : 'Not connected'
              }}
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <UButton :loading="savingAndSyncing" @click="saveAndSyncSquare">
                Save + Sync Square
              </UButton>
              <UButton color="error" variant="soft" :loading="deleting" @click="deleteOption">
                Delete option
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
