<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type HoldSettings = {
  holdCreditCost: number
  minHoldBookingHours: number
  holdMinEndHour: number
  holdEndHour: number
  holdTopupPriceCents: number
  holdTopupQuantity: number
  holdTopupLabel: string
  holdTopupSquareItemId: string
  holdTopupSquareVariationId: string
}

const toast = useToast()
const saving = ref(false)

const form = reactive<HoldSettings>({
  holdCreditCost: 2,
  minHoldBookingHours: 4,
  holdMinEndHour: 18,
  holdEndHour: 8,
  holdTopupPriceCents: 2500,
  holdTopupQuantity: 1,
  holdTopupLabel: 'Overnight hold add-on',
  holdTopupSquareItemId: '',
  holdTopupSquareVariationId: ''
})

const { pending, refresh } = await useAsyncData('admin:holds:settings', async () => {
  const res = await $fetch<{ settings: HoldSettings }>('/api/admin/holds/settings')
  form.holdCreditCost = Number(res.settings.holdCreditCost ?? 2)
  form.minHoldBookingHours = Number(res.settings.minHoldBookingHours ?? 4)
  form.holdMinEndHour = Number(res.settings.holdMinEndHour ?? 18)
  form.holdEndHour = Number(res.settings.holdEndHour ?? 8)
  form.holdTopupPriceCents = Number(res.settings.holdTopupPriceCents ?? 2500)
  form.holdTopupQuantity = Number(res.settings.holdTopupQuantity ?? 1)
  form.holdTopupLabel = String(res.settings.holdTopupLabel ?? 'Overnight hold add-on')
  form.holdTopupSquareItemId = String(res.settings.holdTopupSquareItemId ?? '')
  form.holdTopupSquareVariationId = String(res.settings.holdTopupSquareVariationId ?? '')
  return res.settings
})

const holdTopupPriceDollars = computed({
  get: () => Number((form.holdTopupPriceCents / 100).toFixed(2)),
  set: (value: number) => {
    if (!Number.isFinite(value)) return
    form.holdTopupPriceCents = Math.max(0, Math.round(value * 100))
  }
})

function formatHourLabel(value: number) {
  const normalized = Math.max(0, Math.min(23, Math.round(Number(value) || 0)))
  const period = normalized >= 12 ? 'PM' : 'AM'
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12
  return `${hour12}:00 ${period}`
}

const holdPolicySummary = computed(() => ({
  minBookingHours: Math.max(1, Math.round(Number(form.minHoldBookingHours) || 1)),
  minEndLabel: formatHourLabel(form.holdMinEndHour),
  holdEndsLabel: formatHourLabel(form.holdEndHour),
  fallbackCreditCost: Math.max(0, Number(form.holdCreditCost) || 0)
}))

const holdTopupSummary = computed(() => ({
  quantity: Math.max(1, Math.round(Number(form.holdTopupQuantity) || 1)),
  label: String(form.holdTopupLabel || '').trim() || 'Overnight hold add-on',
  priceLabel: `$${(Math.max(0, Number(form.holdTopupPriceCents) || 0) / 100).toFixed(2)}`
}))

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

async function saveSettings() {
  saving.value = true
  try {
    await $fetch('/api/admin/holds/settings.upsert', {
      method: 'POST',
      body: {
        holdCreditCost: form.holdCreditCost,
        minHoldBookingHours: form.minHoldBookingHours,
        holdMinEndHour: form.holdMinEndHour,
        holdEndHour: form.holdEndHour,
        holdTopupPriceCents: form.holdTopupPriceCents,
        holdTopupQuantity: form.holdTopupQuantity,
        holdTopupLabel: form.holdTopupLabel
      }
    })

    const syncRes = await $fetch<{ squareItemId: string, squareVariationId: string }>('/api/admin/holds/settings.sync-square', {
      method: 'POST',
      body: {}
    })

    form.holdTopupSquareItemId = syncRes.squareItemId
    form.holdTopupSquareVariationId = syncRes.squareVariationId

    toast.add({ title: 'Hold settings saved and synced' })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save hold settings',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-holds"
    title="Holds"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: 'Save settings',
          icon: 'i-lucide-save',
          loading: saving,
          onSelect: () => { void saveSettings() }
        }"
        :secondary="[
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
      icon="i-lucide-package-plus"
      title="Hold top-up settings"
      description="Configure hold fallback and top-up pricing, then sync a single hold item in Square for tracking."
    />

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="space-y-4">
        <UCard>
          <div class="space-y-4">
            <div>
              <div class="font-medium">
                Hold policy rules
              </div>
              <div class="text-sm text-dimmed">
                Rules that gate who can request overnight holds and how fallback billing works.
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Minimum booking hours for hold">
                <UInput
                  v-model.number="form.minHoldBookingHours"
                  type="number"
                  min="1"
                  max="24"
                />
              </UFormField>
              <UFormField label="Hold credit fallback cost">
                <UInput
                  v-model.number="form.holdCreditCost"
                  type="number"
                  min="0"
                  max="50"
                />
              </UFormField>
              <UFormField label="Hold requires booking end hour (LA)">
                <UInput
                  v-model.number="form.holdMinEndHour"
                  type="number"
                  min="0"
                  max="23"
                />
              </UFormField>
              <UFormField label="Hold ends next day at hour (LA)">
                <UInput
                  v-model.number="form.holdEndHour"
                  type="number"
                  min="0"
                  max="23"
                />
              </UFormField>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="space-y-4">
            <div>
              <div class="font-medium">
                Hold top-up product
              </div>
              <div class="text-sm text-dimmed">
                Product details used when syncing a single hold add-on into Square.
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Hold top-up label">
                <UInput v-model="form.holdTopupLabel" />
              </UFormField>
              <UFormField label="Holds granted per purchase">
                <UInput
                  v-model.number="form.holdTopupQuantity"
                  type="number"
                  min="1"
                  max="50"
                />
              </UFormField>
              <UFormField label="Hold top-up price ($)">
                <UInput
                  v-model.number="holdTopupPriceDollars"
                  type="number"
                  min="1"
                  max="1000"
                  step="0.01"
                />
              </UFormField>
            </div>

            <div class="rounded-md border border-default/80 bg-default/40 p-3 text-xs">
              <div class="font-medium text-highlighted">
                Square linkage
              </div>
              <div class="mt-2 space-y-1 text-dimmed">
                <div>Item ID: {{ form.holdTopupSquareItemId || 'Not linked' }}</div>
                <div>Variation ID: {{ form.holdTopupSquareVariationId || 'Not linked' }}</div>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <aside class="space-y-4 xl:sticky xl:top-4 self-start">
        <UCard>
          <div class="text-sm font-medium">
            Policy summary
          </div>
          <dl class="mt-3 space-y-2 text-sm">
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Minimum booking
              </dt>
              <dd class="font-medium text-right">
                {{ holdPolicySummary.minBookingHours }} hour{{ holdPolicySummary.minBookingHours === 1 ? '' : 's' }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Earliest hold trigger
              </dt>
              <dd class="font-medium text-right">
                {{ holdPolicySummary.minEndLabel }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Hold release time
              </dt>
              <dd class="font-medium text-right">
                {{ holdPolicySummary.holdEndsLabel }} (next day)
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Fallback charge
              </dt>
              <dd class="font-medium text-right">
                {{ holdPolicySummary.fallbackCreditCost }} credit{{ holdPolicySummary.fallbackCreditCost === 1 ? '' : 's' }}
              </dd>
            </div>
          </dl>
        </UCard>

        <UCard>
          <div class="text-sm font-medium">
            Top-up summary
          </div>
          <dl class="mt-3 space-y-2 text-sm">
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Product label
              </dt>
              <dd class="font-medium text-right">
                {{ holdTopupSummary.label }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Grants per purchase
              </dt>
              <dd class="font-medium text-right">
                {{ holdTopupSummary.quantity }} hold{{ holdTopupSummary.quantity === 1 ? '' : 's' }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Price
              </dt>
              <dd class="font-medium text-right">
                {{ holdTopupSummary.priceLabel }}
              </dd>
            </div>
          </dl>
        </UCard>
      </aside>
    </div>
  </DashboardPageScaffold>
</template>
