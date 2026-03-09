<script setup lang="ts">
import { buildDiscountLabel, parseDiscountLabel } from '~~/app/utils/membershipDiscount'
import type { DiscountType } from '~~/app/utils/membershipDiscount'

definePageMeta({ middleware: ['admin'] })

type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

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

type TierForm = {
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
  priceDollars: string
  variations: Array<{
    cadence: Cadence
    provider: 'square'
    providerPlanId: string
    providerPlanVariationId: string
    creditsPerMonth: number
    currency: string
    discountType: DiscountType
    discountAmount: string
    discountLabel: string
    active: boolean
    visible: boolean
    sortOrder: number
  }>
}

type TierReorderItem = {
  tierId: string
  sortOrder: number
}

const cadenceOrder: Cadence[] = ['daily', 'weekly', 'monthly', 'quarterly', 'annual']
const usdAmountRegex = /^\d+(?:\.\d{1,2})?$/
const discountTypeOptions = [
  { label: 'None', value: 'none' },
  { label: 'Percentage', value: 'percent' },
  { label: 'Dollar amount', value: 'dollar' }
] as const

function formatCentsAsDollars(cents: number) {
  return (Math.round(cents) / 100).toFixed(2)
}

function parseDollarsToCents(value: string) {
  const trimmed = value.trim()
  if (!usdAmountRegex.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

function parseDiscountAmount(value: string, type: DiscountType) {
  if (type === 'none') return true
  const trimmed = value.trim()
  if (!usdAmountRegex.test(trimmed)) return false
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return false
  if (type === 'percent' && parsed > 100) return false
  return true
}

function defaultVariations() {
  return [
    { cadence: 'daily' as const, provider: 'square' as const, providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 4, currency: 'USD', discountType: 'none', discountAmount: '', discountLabel: '', active: false, visible: true, sortOrder: 1 },
    { cadence: 'weekly' as const, provider: 'square' as const, providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 8, currency: 'USD', discountType: 'none', discountAmount: '', discountLabel: '', active: false, visible: true, sortOrder: 2 },
    { cadence: 'monthly' as const, provider: 'square' as const, providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 12, currency: 'USD', discountType: 'none', discountAmount: '', discountLabel: '', active: true, visible: true, sortOrder: 3 },
    { cadence: 'quarterly' as const, provider: 'square' as const, providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 12, currency: 'USD', discountType: 'percent', discountAmount: '5', discountLabel: 'Save 5%', active: true, visible: true, sortOrder: 4 },
    { cadence: 'annual' as const, provider: 'square' as const, providerPlanId: '', providerPlanVariationId: '', creditsPerMonth: 12, currency: 'USD', discountType: 'percent', discountAmount: '10', discountLabel: 'Save 10%', active: true, visible: true, sortOrder: 5 }
  ]
}

const toast = useToast()
const loading = ref(false)
const savingAndSyncing = ref(false)
const deleting = ref(false)
const reordering = ref(false)
const selectedTierId = ref<string | null>(null)
const draggedTierId = ref<string | null>(null)

const form = reactive<TierForm>({
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
  priceDollars: '400.00',
  variations: defaultVariations()
})

const { data: tierRows, refresh } = await useAsyncData('admin:subscription:tiers', async () => {
  const res = await $fetch<{ tiers: TierRecord[] }>('/api/admin/membership/tiers')
  return res.tiers
})

const reorderedTiers = ref<TierRecord[]>([])
const tiers = computed(() => tierRows.value ?? [])

function normalizeErrorMessage(message: string) {
  const trimmed = message.trim()
  if (!trimmed) return 'Unknown error'

  if (trimmed.includes('membership_plan_variations_cadence_check')) {
    return 'Database still allows only monthly/quarterly/annual cadences. Apply migration 20240022_membership_cadence_daily_weekly.sql, then retry.'
  }

  if (trimmed.includes('subscription phase price cannot be less than 100 except 0')) {
    return 'Square requires each active cadence price to be at least $1.00, or exactly $0.00 for free plans.'
  }

  const detailMatch = trimmed.match(/"detail"\s*:\s*"([^"]+)"/)
  if (detailMatch?.[1]) return detailMatch[1]

  return trimmed
}

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string, message?: string }, message?: string, statusMessage?: string }
  const raw = maybe.data?.statusMessage ?? maybe.data?.message ?? maybe.statusMessage ?? maybe.message ?? 'Unknown error'
  return normalizeErrorMessage(raw)
}

function syncSelectedTier(next: TierRecord[]) {
  if (!next.length) return
  if (!selectedTierId.value) {
    loadTier(next[0]!.id)
    return
  }
  const stillExists = next.find(tier => tier.id === selectedTierId.value)
  if (!stillExists) loadTier(next[0]!.id)
}

watch(
  tiers,
  (next) => {
    reorderedTiers.value = [...next]
    syncSelectedTier(next)
  },
  { immediate: true }
)

onMounted(() => {
  if (!tierRows.value?.length) {
    void reloadTiers()
  }
})

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
  form.priceDollars = '400.00'
  form.variations = defaultVariations()
}

function duplicateTier() {
  if (!form.displayName) {
    resetForm()
    return
  }

  form.id = ''
  form.displayName = `${form.displayName} (copy)`
  form.sortOrder = 100
  form.variations = form.variations.map(variation => ({
    ...variation,
    providerPlanId: '',
    providerPlanVariationId: ''
  }))
  selectedTierId.value = null
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
  form.variations = cadenceOrder.map((cadence, idx) => {
    const variation = tier.membership_plan_variations.find(row => row.cadence === cadence)
    const parsedDiscount = parseDiscountLabel(variation?.discount_label ?? '')
    return {
      cadence,
      provider: 'square',
      providerPlanId: variation?.provider_plan_id ?? '',
      providerPlanVariationId: variation?.provider_plan_variation_id ?? '',
      creditsPerMonth: Number(variation?.credits_per_month ?? 0),
      currency: variation?.currency ?? 'USD',
      discountType: parsedDiscount.type,
      discountAmount: parsedDiscount.amount,
      discountLabel: variation?.discount_label ?? '',
      active: variation?.active ?? false,
      visible: variation?.visible ?? true,
      sortOrder: Number(variation?.sort_order ?? idx + 1)
    }
  })

  const basePriceVariation = tier.membership_plan_variations.find(row => row.cadence === 'monthly')
    || tier.membership_plan_variations.find(row => row.active)
    || tier.membership_plan_variations[0]

  form.priceDollars = formatCentsAsDollars(Number(basePriceVariation?.price_cents ?? 0))
}

function cadenceTitle(cadence: Cadence) {
  if (cadence === 'daily') return 'Daily'
  if (cadence === 'weekly') return 'Weekly'
  if (cadence === 'quarterly') return 'Quarterly'
  if (cadence === 'annual') return 'Annual'
  return 'Monthly'
}

function cadenceCreditsUnit(cadence: Cadence) {
  if (cadence === 'daily') return 'day'
  if (cadence === 'weekly') return 'week'
  return 'month'
}

async function reloadTiers() {
  loading.value = true
  try {
    await refresh()
  } finally {
    loading.value = false
  }
}

function buildTierReorderPayload(rows: TierRecord[]): TierReorderItem[] {
  return rows.map((tier, index) => ({
    tierId: tier.id,
    sortOrder: (index + 1) * 10
  }))
}

async function persistTierReorder(nextTiers: TierRecord[]) {
  if (!nextTiers.length) return
  reordering.value = true
  try {
    await $fetch('/api/admin/membership/tier-reorder', {
      method: 'POST',
      body: {
        tiers: buildTierReorderPayload(nextTiers)
      }
    })
    await reloadTiers()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save tier order',
      description: readErrorMessage(error),
      color: 'error'
    })
    reorderedTiers.value = [...tiers.value]
  } finally {
    reordering.value = false
  }
}

function onTierDragStart(event: DragEvent, tierId: string) {
  draggedTierId.value = tierId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', tierId)
  }
}

function onTierDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

async function onTierDrop(event: DragEvent, targetTierId: string) {
  event.preventDefault()
  const sourceTierId = event.dataTransfer?.getData('text/plain') || draggedTierId.value
  draggedTierId.value = null
  if (!sourceTierId || sourceTierId === targetTierId) return

  const nextOrder = [...reorderedTiers.value]
  const fromIndex = nextOrder.findIndex(tier => tier.id === sourceTierId)
  const toIndex = nextOrder.findIndex(tier => tier.id === targetTierId)
  if (fromIndex < 0 || toIndex < 0) return

  const [moved] = nextOrder.splice(fromIndex, 1)
  nextOrder.splice(toIndex, 0, moved)
  reorderedTiers.value = nextOrder
  await persistTierReorder(nextOrder)
}

function onTierDragEnd() {
  draggedTierId.value = null
}

function getInvalidPrice() {
  return parseDollarsToCents(form.priceDollars) === null
}

function getTooLowPrice() {
  const cents = parseDollarsToCents(form.priceDollars)
  if (cents === null) return false
  const hasEnabledCadence = form.variations.some(variation => variation.active)
  if (!hasEnabledCadence) return false
  return cents !== 0 && cents < 100
}

function getInvalidActiveDiscountInput() {
  return form.variations.find((variation) => {
    if (!variation.active) return false
    if (variation.discountType === 'none') return false
    return !parseDiscountAmount(variation.discountAmount, variation.discountType)
  })
}

function getTierPayloadBase() {
  return {
    id: form.id,
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
    directAccessOnly: form.directAccessOnly
  }
}

async function saveTier() {
  savingAndSyncing.value = true
  try {
    const invalidDiscount = getInvalidActiveDiscountInput()
    if (invalidDiscount) {
      toast.add({
        title: 'Invalid discount',
        description: `${cadenceTitle(invalidDiscount.cadence)} discount is invalid.`
          + (invalidDiscount.discountType === 'percent'
            ? ' Enter a percent between 0 and 100.'
            : ' Enter a dollar amount with up to 2 decimals.'),
        color: 'error'
      })
      return
    }

    const invalidPrice = getInvalidPrice()
    if (invalidPrice) {
      toast.add({
        title: 'Invalid price',
        description: 'Price must be a valid dollar amount with up to 2 decimals.',
        color: 'error'
      })
      return
    }

    const tooLowPrice = getTooLowPrice()
    if (tooLowPrice) {
      toast.add({
        title: 'Price Too Low',
        description: 'Price must be at least $1.00, or exactly $0.00.',
        color: 'error'
      })
      return
    }

    const priceCents = parseDollarsToCents(form.priceDollars) ?? 0

    const cadenceMap = Object.fromEntries(form.variations.map(variation => [
      variation.cadence,
      {
        enabled: variation.active,
        creditsPerMonth: variation.creditsPerMonth,
        priceCents,
        discountLabel: buildDiscountLabel(variation.discountType, variation.discountAmount, variation.discountLabel) ?? null,
        providerPlanId: variation.providerPlanId.trim() || null,
        providerPlanVariationId: variation.providerPlanVariationId.trim() || null,
        currency: variation.currency || 'USD',
        visible: variation.visible,
        sortOrder: variation.sortOrder
      }
    ])) as Record<Cadence, {
      enabled: boolean
      creditsPerMonth: number
      priceCents: number
      discountLabel: string | null
      providerPlanId: string | null
      providerPlanVariationId: string | null
      currency: string
      visible: boolean
      sortOrder: number
    }>

    const tierPayloadBase = getTierPayloadBase()
    const isExistingTier = Boolean(selectedTierId.value && tiers.value.find(tier => tier.id === selectedTierId.value))

    if (isExistingTier) {
      await $fetch<{ squarePlanId: string | null }>('/api/admin/membership/tier-upsert', {
        method: 'POST',
        body: {
          id: tierPayloadBase.id,
          displayName: tierPayloadBase.displayName,
          description: tierPayloadBase.description,
          bookingWindowDays: tierPayloadBase.bookingWindowDays,
          peakMultiplier: tierPayloadBase.peakMultiplier,
          maxBank: tierPayloadBase.maxBank,
          maxSlots: tierPayloadBase.maxSlots,
          holdsIncluded: tierPayloadBase.holdsIncluded,
          sortOrder: tierPayloadBase.sortOrder,
          active: tierPayloadBase.active,
          visible: tierPayloadBase.visible,
          directAccessOnly: tierPayloadBase.directAccessOnly,
          variations: form.variations.map(variation => ({
            cadence: variation.cadence,
            provider: 'square' as const,
            providerPlanId: variation.providerPlanId.trim() || null,
            providerPlanVariationId: variation.providerPlanVariationId.trim() || null,
            creditsPerMonth: variation.creditsPerMonth,
            priceCents,
            currency: variation.currency || 'USD',
            discountLabel: buildDiscountLabel(variation.discountType, variation.discountAmount, variation.discountLabel) ?? null,
            active: variation.active,
            visible: variation.visible,
            sortOrder: variation.sortOrder
          }))
        }
      })
      toast.add({
        title: 'Tier saved',
        description: 'Updated in database without re-syncing locked Square variations.'
      })
    } else {
      const res = await $fetch<{ squarePlanId: string }>('/api/admin/membership/tier-create', {
        method: 'POST',
        body: {
          tierId: tierPayloadBase.id,
          displayName: tierPayloadBase.displayName,
          description: tierPayloadBase.description,
          bookingWindowDays: tierPayloadBase.bookingWindowDays,
          peakMultiplier: tierPayloadBase.peakMultiplier,
          maxBank: tierPayloadBase.maxBank,
          maxSlots: tierPayloadBase.maxSlots,
          holdsIncluded: tierPayloadBase.holdsIncluded,
          sortOrder: tierPayloadBase.sortOrder,
          active: tierPayloadBase.active,
          visible: tierPayloadBase.visible,
          directAccessOnly: tierPayloadBase.directAccessOnly,
          cadences: cadenceMap
        }
      })
      toast.add({
        title: 'Tier saved and synced',
        description: `Square plan: ${res.squarePlanId}`
      })
    }

    await reloadTiers()
    if (form.id) loadTier(form.id)
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save tier',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingAndSyncing.value = false
  }
}

async function deleteTier() {
  if (!form.id) {
    toast.add({ title: 'Select a tier first', color: 'warning' })
    return
  }
  const confirmed = window.confirm('Delete this tier from Square and the database? If it has membership history, it will be archived instead.')
  if (!confirmed) return

  deleting.value = true
  try {
    const res = await $fetch<{ mode: 'deleted' | 'archived', squareWarnings?: string[] }>('/api/admin/membership/tier-delete', {
      method: 'POST',
      body: { tierId: form.id }
    })
    toast.add({
      title: res.mode === 'deleted' ? 'Tier deleted' : 'Tier archived',
      description: res.mode === 'deleted'
        ? 'Removed from Square and database.'
        : 'Removed from Square and archived in the database because history exists.'
    })
    if (Array.isArray(res.squareWarnings) && res.squareWarnings.length > 0) {
      toast.add({
        title: 'Square cleanup warning',
        description: res.squareWarnings[0],
        color: 'warning'
      })
    }
    resetForm()
    await reloadTiers()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not delete tier',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    deleting.value = false
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
      <ClientOnly fallback-tag="div" fallback="Loading subscription management...">
        <div class="p-4 space-y-4">
          <UAlert
            color="warning"
            variant="soft"
            icon="i-lucide-badge-check"
            title="Subscription management"
            description="Create new plans and keep database + Square variations in sync."
          />
          <div class="text-xs text-dimmed">
            Credit release behavior: daily plans release per day, weekly per week, and monthly/quarterly/annual release monthly (quarterly/annual are split across months).
            Hold cap / month resets on each monthly grant cycle.
          </div>

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
                <div v-if="!reorderedTiers.length" class="text-xs text-dimmed">
                  No tiers found yet. Hit refresh to load.
                </div>
                <template v-else>
                  <button
                    v-for="tier in reorderedTiers"
                    :key="tier.id"
                    class="group/row w-full rounded-lg border border-default p-2 text-left text-sm transition hover:bg-elevated"
                    :class="selectedTierId === tier.id ? 'bg-elevated border-primary' : ''"
                    draggable="true"
                    @dragstart="onTierDragStart($event, tier.id)"
                    @dragover="onTierDragOver"
                    @drop="onTierDrop($event, tier.id)"
                    @dragend="onTierDragEnd"
                    @click="loadTier(tier.id)"
                  >
                    <div class="flex min-h-6 items-center gap-2">
                      <UIcon
                        name="i-lucide-grip-vertical"
                        class="size-4 flex-shrink-0 text-dimmed opacity-70 group-hover/row:opacity-100"
                      />
                      <span class="min-w-0 flex-1 truncate font-medium">{{ tier.display_name }}</span>
                      <UBadge :color="tier.active ? 'success' : 'neutral'" size="xs" variant="soft" class="shrink-0">
                        {{ tier.active ? 'active' : 'inactive' }}
                      </UBadge>
                    </div>
                    <div class="mt-1 text-xs text-dimmed truncate">
                      {{ tier.id }}
                    </div>
                  </button>
                  <div v-if="reordering" class="text-xs text-dimmed">
                    Saving order...
                  </div>
                </template>
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
                <UFormField label="Hold cap / month">
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
                    <UFormField :label="`Credits / ${cadenceCreditsUnit(variation.cadence)}`">
                      <UFieldGroup>
                        <UBadge variant="outline" color="neutral" size="sm">
                          {{ cadenceCreditsUnit(variation.cadence) }}
                        </UBadge>
                        <UInput
                          v-model.number="variation.creditsPerMonth"
                          type="number"
                          min="0"
                        />
                      </UFieldGroup>
                    </UFormField>
                    <UFormField label="Discount">
                      <UFieldGroup>
                        <USelect
                          v-model="variation.discountType"
                          :items="discountTypeOptions"
                          value-key="value"
                          option-attribute="label"
                          size="sm"
                        />
                        <template v-if="variation.discountType === 'percent'">
                          <UInput
                            v-model="variation.discountAmount"
                            type="text"
                            inputmode="decimal"
                            placeholder="5"
                          />
                          <UBadge variant="outline" color="neutral" size="sm">
                            %
                          </UBadge>
                        </template>
                        <template v-else-if="variation.discountType === 'dollar'">
                          <UBadge variant="outline" color="neutral" size="sm">
                            $
                          </UBadge>
                          <UInput
                            v-model="variation.discountAmount"
                            type="text"
                            inputmode="decimal"
                            placeholder="10.00"
                          />
                        </template>
                        <template v-else>
                          <UBadge color="neutral" variant="outline" size="sm">
                            None
                          </UBadge>
                          <UInput
                            v-model="variation.discountLabel"
                            placeholder="No discount text"
                          />
                        </template>
                      </UFieldGroup>
                    </UFormField>
                  </div>
                </div>
              </div>

              <div class="mt-4">
                <UFormField label="Price">
                  <UFieldGroup>
                    <UBadge variant="outline" color="neutral" size="sm">
                      $
                    </UBadge>
                    <UInput
                      v-model="form.priceDollars"
                      type="text"
                      inputmode="decimal"
                      placeholder="199.99"
                    />
                  </UFieldGroup>
                </UFormField>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <UButton :loading="savingAndSyncing" @click="saveTier">
                  Save tier
                </UButton>
                <UButton color="neutral" variant="soft" @click="duplicateTier">
                  Duplicate tier
                </UButton>
                <UButton color="error" variant="soft" :loading="deleting" @click="deleteTier">
                  Delete tier
                </UButton>
              </div>
            </UCard>
          </div>
        </div>
      </ClientOnly>
    </template>
  </UDashboardPanel>
</template>
