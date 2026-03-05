<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type Cadence = 'monthly' | 'quarterly' | 'annual'

type TierVariation = {
  cadence: Cadence
  provider: 'square'
  provider_plan_id: string | null
  provider_plan_variation_id: string | null
  credits_per_month: number
  price_cents: number
  currency: string
  discount_label: string | null
  active: boolean
  visible: boolean
  sort_order: number
}

type TierRecord = {
  id: string
  display_name: string
  description: string | null
  booking_window_days: number
  peak_multiplier: number
  max_bank: number
  max_slots: number | null
  holds_included: number
  active: boolean
  visible: boolean
  direct_access_only: boolean
  sort_order: number
  membership_plan_variations: TierVariation[]
}

type TierUpsertPayload = {
  id: string
  displayName: string
  description: string
  bookingWindowDays: number
  peakMultiplier: number
  maxBank: number
  maxSlots: number | null
  holdsIncluded: number
  active: boolean
  visible: boolean
  directAccessOnly: boolean
  sortOrder: number
  variations: Array<{
    cadence: Cadence
    provider: 'square'
    providerPlanId: string
    providerPlanVariationId: string
    creditsPerMonth: number
    priceCents: number
    currency: string
    discountLabel: string
    active: boolean
    visible: boolean
    sortOrder: number
  }>
}

const toast = useToast()
const loading = ref(false)
const saving = ref(false)
const syncingCadence = ref<Cadence | null>(null)
const selectedTierId = ref<string | null>(null)

const form = reactive<TierUpsertPayload>({
  id: '',
  displayName: '',
  description: '',
  bookingWindowDays: 30,
  peakMultiplier: 1,
  maxBank: 100,
  maxSlots: null,
  holdsIncluded: 0,
  active: true,
  visible: true,
  directAccessOnly: false,
  sortOrder: 100,
  variations: [
    { cadence: 'monthly', provider: 'square', providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 12, priceCents: 40000, currency: 'USD', discountLabel: '', active: true, visible: true, sortOrder: 1 },
    { cadence: 'quarterly', provider: 'square', providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 12, priceCents: 114000, currency: 'USD', discountLabel: 'Save 5%', active: true, visible: true, sortOrder: 2 },
    { cadence: 'annual', provider: 'square', providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 12, priceCents: 432000, currency: 'USD', discountLabel: 'Save 10%', active: true, visible: true, sortOrder: 3 }
  ]
})

const { data: tierRows, refresh } = await useAsyncData('admin:subscription:tiers', async () => {
  const res = await $fetch<{ tiers: TierRecord[] }>('/api/admin/membership/tiers')
  return res.tiers
})

const tiers = computed(() => tierRows.value ?? [])

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

onMounted(() => {
  if (tiers.value.length && !selectedTierId.value) {
    loadTier(tiers.value[0]!.id)
  }
})

watch(tiers, (next) => {
  if (!next.length) return
  if (!selectedTierId.value) {
    loadTier(next[0]!.id)
    return
  }
  const stillExists = next.find(tier => tier.id === selectedTierId.value)
  if (!stillExists) loadTier(next[0]!.id)
}, { immediate: true })

function resetForm() {
  selectedTierId.value = null
  form.id = ''
  form.displayName = ''
  form.description = ''
  form.bookingWindowDays = 30
  form.peakMultiplier = 1
  form.maxBank = 100
  form.maxSlots = null
  form.holdsIncluded = 0
  form.active = true
  form.visible = true
  form.directAccessOnly = false
  form.sortOrder = 100
  form.variations = [
    { cadence: 'monthly', provider: 'square', providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 12, priceCents: 40000, currency: 'USD', discountLabel: '', active: true, visible: true, sortOrder: 1 },
    { cadence: 'quarterly', provider: 'square', providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 12, priceCents: 114000, currency: 'USD', discountLabel: 'Save 5%', active: true, visible: true, sortOrder: 2 },
    { cadence: 'annual', provider: 'square', providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 12, priceCents: 432000, currency: 'USD', discountLabel: 'Save 10%', active: true, visible: true, sortOrder: 3 }
  ]
}

function loadTier(tierId: string) {
  const tier = tiers.value.find(row => row.id === tierId)
  if (!tier) return
  selectedTierId.value = tierId
  form.id = tier.id
  form.displayName = tier.display_name
  form.description = tier.description ?? ''
  form.bookingWindowDays = tier.booking_window_days
  form.peakMultiplier = Number(tier.peak_multiplier)
  form.maxBank = Number(tier.max_bank)
  form.maxSlots = tier.max_slots
  form.holdsIncluded = Number(tier.holds_included)
  form.active = tier.active
  form.visible = tier.visible
  form.directAccessOnly = tier.direct_access_only
  form.sortOrder = Number(tier.sort_order ?? 0)
  form.variations = ['monthly', 'quarterly', 'annual'].map((cadence, idx) => {
    const variation = tier.membership_plan_variations.find(row => row.cadence === cadence)
    return {
      cadence: cadence as Cadence,
      provider: 'square',
      providerPlanId: variation?.provider_plan_id ?? '',
      providerPlanVariationId: variation?.provider_plan_variation_id ?? '',
      creditsPerMonth: Number(variation?.credits_per_month ?? 0),
      priceCents: Number(variation?.price_cents ?? 0),
      currency: variation?.currency ?? 'USD',
      discountLabel: variation?.discount_label ?? '',
      active: variation?.active ?? false,
      visible: variation?.visible ?? true,
      sortOrder: Number(variation?.sort_order ?? idx + 1)
    }
  })
}

function cadenceTitle(cadence: Cadence) {
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return 'Monthly'
}

async function reloadTiers() {
  loading.value = true
  try {
    await refresh()
  } finally {
    loading.value = false
  }
}

async function saveTier() {
  saving.value = true
  try {
    const payload = {
      ...form,
      description: form.description.trim() || null,
      variations: form.variations.map(variation => ({
        ...variation,
        providerPlanId: variation.providerPlanId.trim() || null,
        providerPlanVariationId: variation.providerPlanVariationId.trim() || null,
        discountLabel: variation.discountLabel.trim() || null
      }))
    }

    await $fetch('/api/admin/membership/tier-upsert', {
      method: 'POST',
      body: payload
    })
    toast.add({ title: 'Tier saved', description: `Saved "${form.id}" in database.` })
    await reloadTiers()
    if (form.id) loadTier(form.id)
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save tier',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function createOrUpdateInSquare() {
  saving.value = true
  try {
    const cadenceMap = Object.fromEntries(form.variations.map(variation => [
      variation.cadence,
      {
        enabled: variation.active,
        creditsPerMonth: variation.creditsPerMonth,
        priceCents: variation.priceCents,
        discountLabel: variation.discountLabel.trim() || null
      }
    ])) as Record<Cadence, { enabled: boolean, creditsPerMonth: number, priceCents: number, discountLabel: string | null }>

    const res = await $fetch<{ squarePlanId: string }>('/api/admin/membership/tier-create', {
      method: 'POST',
      body: {
        tierId: form.id,
        displayName: form.displayName,
        description: form.description.trim() || null,
        bookingWindowDays: form.bookingWindowDays,
        peakMultiplier: form.peakMultiplier,
        maxBank: form.maxBank,
        maxSlots: form.maxSlots,
        holdsIncluded: form.holdsIncluded,
        sortOrder: form.sortOrder,
        active: form.active,
        visible: form.visible,
        directAccessOnly: form.directAccessOnly,
        cadences: cadenceMap
      }
    })

    toast.add({
      title: 'Square sync complete',
      description: `Subscription plan synced to Square (${res.squarePlanId}).`
    })
    await reloadTiers()
    if (form.id) loadTier(form.id)
  } catch (error: unknown) {
    toast.add({
      title: 'Square sync failed',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function syncVariation(cadence: Cadence) {
  syncingCadence.value = cadence
  try {
    await $fetch('/api/admin/membership/variation-sync-square', {
      method: 'POST',
      body: {
        tierId: form.id,
        cadence
      }
    })
    toast.add({ title: 'Variation synced', description: `${cadenceTitle(cadence)} pricing synced to Square.` })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not sync variation',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    syncingCadence.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="admin-subscriptions">
    <template #header>
      <UDashboardNavbar title="Subscriptions Creator" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="loading" @click="reloadTiers" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-badge-check"
          title="Subscription management"
          description="This page lets you create and update membership tiers in the database and sync plans/variations to Square."
        />

        <div class="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <UCard>
            <div class="flex items-center justify-between gap-2">
              <div class="font-medium">
                Existing tiers
              </div>
              <UButton size="xs" color="neutral" variant="soft" @click="resetForm">
                New tier
              </UButton>
            </div>
            <div class="mt-3 space-y-2">
              <button
                v-for="tier in tiers"
                :key="tier.id"
                class="w-full rounded-lg border border-default p-2 text-left text-sm transition hover:bg-elevated"
                :class="selectedTierId === tier.id ? 'bg-elevated border-primary' : ''"
                @click="loadTier(tier.id)"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium">{{ tier.display_name }}</span>
                  <UBadge :color="tier.active ? 'success' : 'neutral'" size="xs" variant="soft">
                    {{ tier.active ? 'active' : 'inactive' }}
                  </UBadge>
                </div>
                <div class="mt-1 text-xs text-dimmed">
                  {{ tier.id }}
                </div>
              </button>
            </div>
          </UCard>

          <UCard>
            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Tier id">
                <UInput v-model="form.id" placeholder="creator_plus" />
              </UFormField>
              <UFormField label="Display name">
                <UInput v-model="form.displayName" placeholder="Creator+" />
              </UFormField>
              <UFormField label="Description" class="md:col-span-2">
                <UInput v-model="form.description" placeholder="Visible in catalog and checkout pages" />
              </UFormField>
              <UFormField label="Booking window (days)">
                <UInput v-model.number="form.bookingWindowDays" type="number" min="1" />
              </UFormField>
              <UFormField label="Peak credits/hr">
                <UInput v-model.number="form.peakMultiplier" type="number" step="0.25" min="1" />
              </UFormField>
              <UFormField label="Max bank">
                <UInput v-model.number="form.maxBank" type="number" min="0" />
              </UFormField>
              <UFormField label="Holds included">
                <UInput v-model.number="form.holdsIncluded" type="number" min="0" />
              </UFormField>
            </div>

            <div class="mt-4 flex flex-wrap gap-4">
              <UCheckbox v-model="form.active" label="Active" />
              <UCheckbox v-model="form.visible" label="Visible" />
              <UCheckbox v-model="form.directAccessOnly" label="Direct access only" />
            </div>

            <div class="mt-4 grid gap-3 xl:grid-cols-3">
              <div
                v-for="variation in form.variations"
                :key="variation.cadence"
                class="rounded-lg border border-default p-3"
              >
                <div class="mb-2 flex items-center justify-between gap-2">
                  <div class="font-medium">
                    {{ cadenceTitle(variation.cadence) }}
                  </div>
                  <UCheckbox v-model="variation.active" label="Enabled" />
                </div>
                <div class="space-y-2">
                  <UInput v-model.number="variation.creditsPerMonth" type="number" min="0" placeholder="Credits / month" />
                  <UInput v-model.number="variation.priceCents" type="number" min="0" placeholder="Price cents" />
                  <UInput v-model="variation.discountLabel" placeholder="Discount label" />
                  <UInput v-model="variation.providerPlanId" placeholder="Square plan ID" />
                  <UInput v-model="variation.providerPlanVariationId" placeholder="Square variation ID" />
                </div>
                <UButton
                  class="mt-3"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  :disabled="!form.id"
                  :loading="syncingCadence === variation.cadence"
                  @click="syncVariation(variation.cadence)"
                >
                  Sync {{ cadenceTitle(variation.cadence) }} to Square
                </UButton>
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <UButton :loading="saving" @click="saveTier">
                Save in database
              </UButton>
              <UButton color="neutral" variant="soft" :loading="saving" @click="createOrUpdateInSquare">
                Create/update in Square
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
    providerPlanVariationId: string
