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
  <UDashboardPanel
    id="admin-holds"
    class="min-h-0 flex-1 admin-ops-panel"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        title="Holds"
        class="admin-ops-navbar"
        :ui="{ root: 'border-b-0', right: 'gap-2' }"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AdminOpsShell>
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-package-plus"
          title="Hold top-up settings"
          description="Configure hold fallback and top-up pricing, then sync a single hold item in Square for tracking."
        />

        <UCard>
          <div class="grid gap-3 md:grid-cols-2">
            <UFormField label="Hold credit fallback cost">
              <UInput v-model.number="form.holdCreditCost" type="number" min="0" max="50" />
            </UFormField>
            <UFormField label="Minimum booking hours for hold">
              <UInput v-model.number="form.minHoldBookingHours" type="number" min="1" max="24" />
            </UFormField>
            <UFormField label="Hold requires booking end hour (LA)">
              <UInput v-model.number="form.holdMinEndHour" type="number" min="0" max="23" />
            </UFormField>
            <UFormField label="Hold ends next day at hour (LA)">
              <UInput v-model.number="form.holdEndHour" type="number" min="0" max="23" />
            </UFormField>
            <UFormField label="Hold top-up label">
              <UInput v-model="form.holdTopupLabel" />
            </UFormField>
            <UFormField label="Holds granted per purchase">
              <UInput v-model.number="form.holdTopupQuantity" type="number" min="1" max="50" />
            </UFormField>
            <UFormField label="Hold top-up price ($)">
              <UInput v-model.number="holdTopupPriceDollars" type="number" min="1" max="1000" step="0.01" />
            </UFormField>
          </div>

          <div class="mt-4 space-y-1 text-xs text-dimmed">
            <div>Square item ID: {{ form.holdTopupSquareItemId || 'Not linked' }}</div>
            <div>Square variation ID: {{ form.holdTopupSquareVariationId || 'Not linked' }}</div>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <UButton :loading="saving" @click="saveSettings">
              Save settings
            </UButton>
          </div>
        </UCard>
      </AdminOpsShell>
    </template>
  </UDashboardPanel>
</template>
