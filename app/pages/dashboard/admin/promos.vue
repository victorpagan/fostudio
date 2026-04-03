<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type PromoCode = {
  id: string
  code: string
  description: string | null
  discount_type: 'percent' | 'fixed_cents'
  discount_value: number
  applies_to: 'all' | 'membership' | 'credits' | 'holds'
  active: boolean
  starts_at: string | null
  ends_at: string | null
  max_redemptions: number | null
  redemptions_count: number
  square_discount_id?: string | null
  square_sync?: {
    valid: boolean
    reason: string
  }
  metadata?: {
    applies_tier_ids?: string[]
    applies_credit_option_keys?: string[]
  } | null
}

type TierOption = {
  id: string
  display_name: string
}

type CreditOption = {
  key: string
  label: string
  active: boolean
}

const toast = useToast()
const saving = ref(false)
const deletingId = ref<string | null>(null)
const selectedId = ref<string | null>(null)

const form = reactive({
  id: '' as string,
  code: '',
  description: '',
  discountType: 'percent' as 'percent' | 'fixed_cents',
  discountValue: 10,
  appliesTo: 'all' as 'all' | 'membership' | 'credits' | 'holds',
  appliesTierIds: [] as string[],
  appliesCreditOptionKeys: [] as string[],
  active: true,
  startsAt: null as string | null,
  endsAt: null as string | null,
  maxRedemptions: null as number | null
})

const { data: promoRows, refresh, pending } = await useAsyncData('admin:promos', async () => {
  const res = await $fetch<{ promos: PromoCode[] }>('/api/admin/promos')
  return res.promos
})

const promos = computed(() => promoRows.value ?? [])
const { data: tierRows, pending: tiersPending, error: tiersError } = await useAsyncData('admin:promo:tiers', async () => {
  const res = await $fetch<{ tiers: TierOption[] }>('/api/admin/membership/tiers')
  return res.tiers ?? []
})
const tierOptions = computed(() => tierRows.value ?? [])
const { data: creditOptionRows, pending: creditOptionsPending, error: creditOptionsError } = await useAsyncData('admin:promo:credit-options', async () => {
  const res = await $fetch<{ options: CreditOption[] }>('/api/admin/credits/options')
  return (res.options ?? []).filter(option => option.active)
})
const creditOptions = computed(() => creditOptionRows.value ?? [])

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
  form.code = ''
  form.description = ''
  form.discountType = 'percent'
  form.discountValue = 10
  form.appliesTo = 'all'
  form.appliesTierIds = []
  form.appliesCreditOptionKeys = []
  form.active = true
  form.startsAt = null
  form.endsAt = null
  form.maxRedemptions = null
}

function loadPromo(promoId: string) {
  const promo = promos.value.find(row => row.id === promoId)
  if (!promo) return
  selectedId.value = promo.id
  form.id = promo.id
  form.code = promo.code
  form.description = promo.description ?? ''
  form.discountType = promo.discount_type
  form.discountValue = promo.discount_type === 'fixed_cents'
    ? Number(promo.discount_value) / 100
    : Number(promo.discount_value)
  form.appliesTo = promo.applies_to
  form.appliesTierIds = Array.isArray(promo.metadata?.applies_tier_ids)
    ? promo.metadata!.applies_tier_ids!.map(id => String(id))
    : []
  form.appliesCreditOptionKeys = Array.isArray(promo.metadata?.applies_credit_option_keys)
    ? promo.metadata!.applies_credit_option_keys!.map(id => String(id))
    : []
  form.active = promo.active
  form.startsAt = promo.starts_at
  form.endsAt = promo.ends_at
  form.maxRedemptions = promo.max_redemptions
}

watch(promos, (next) => {
  if (!next.length) return
  if (!selectedId.value) {
    loadPromo(next[0]!.id)
    return
  }
  const stillExists = next.find(row => row.id === selectedId.value)
  if (!stillExists) loadPromo(next[0]!.id)
}, { immediate: true })

const validationErrors = computed(() => {
  const errors: string[] = []
  const code = form.code.trim().toUpperCase()
  if (!code) errors.push('Code is required.')
  if (code.length < 2 || code.length > 64) errors.push('Code must be 2-64 characters.')
  if (!/^[A-Z0-9_-]+$/.test(code)) errors.push('Code can only include letters, numbers, "_" or "-".')

  if (!Number.isFinite(form.discountValue) || form.discountValue <= 0) {
    errors.push('Discount value must be greater than zero.')
  }
  if (form.discountType === 'percent' && form.discountValue > 100) {
    errors.push('Percent discount cannot exceed 100%.')
  }

  const startsAtMs = form.startsAt ? Date.parse(form.startsAt) : Number.NaN
  const endsAtMs = form.endsAt ? Date.parse(form.endsAt) : Number.NaN
  if (Number.isFinite(startsAtMs) && Number.isFinite(endsAtMs) && endsAtMs <= startsAtMs) {
    errors.push('End date must be after start date.')
  }

  if (form.appliesTo === 'membership' && form.appliesTierIds.some(id => !id.trim())) {
    errors.push('Membership tier scope contains an invalid tier id.')
  }

  return errors
})

const canSave = computed(() => !validationErrors.value.length && !saving.value)

async function savePromo() {
  if (validationErrors.value.length) {
    toast.add({
      title: 'Invalid promo configuration',
      description: validationErrors.value[0],
      color: 'error'
    })
    return
  }
  saving.value = true
  try {
    await $fetch('/api/admin/promos.upsert', {
      method: 'POST',
      body: {
        id: form.id || undefined,
        code: form.code,
        description: form.description.trim() || null,
        discountType: form.discountType,
        discountValue: form.discountValue,
        appliesTo: form.appliesTo,
        appliesTierIds: form.appliesTierIds,
        appliesCreditOptionKeys: form.appliesCreditOptionKeys,
        active: form.active,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        maxRedemptions: form.maxRedemptions
      }
    })
    toast.add({ title: 'Promo saved' })
    await refresh()
    if (selectedId.value) loadPromo(selectedId.value)
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save promo',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function deletePromo(id: string) {
  deletingId.value = id
  try {
    await $fetch(`/api/admin/promos/${id}`, { method: 'DELETE' })
    toast.add({ title: 'Promo deleted' })
    if (selectedId.value === id) resetForm()
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not delete promo',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    deletingId.value = null
  }
}

function formatPromoValue(promo: PromoCode) {
  if (promo.discount_type === 'percent') return `${promo.discount_value}%`
  return `$${(promo.discount_value / 100).toFixed(2)}`
}

function formatPromoAppliesTo(promo: PromoCode) {
  if (promo.applies_to === 'credits') {
    const optionKeys = Array.isArray(promo.metadata?.applies_credit_option_keys) ? promo.metadata!.applies_credit_option_keys! : []
    if (!optionKeys.length) return 'Credits: all packages'
    const optionMap = new Map((creditOptions.value ?? []).map(option => [option.key, option.label]))
    const labels = optionKeys.map(key => optionMap.get(key) ?? key)
    return `Credits: ${labels.join(', ')}`
  }
  if (promo.applies_to !== 'membership') return `Applies to ${promo.applies_to}`
  const tierIds = Array.isArray(promo.metadata?.applies_tier_ids) ? promo.metadata!.applies_tier_ids! : []
  if (!tierIds.length) return 'Applies to all memberships'
  const tierMap = new Map((tierRows.value ?? []).map(tier => [tier.id, tier.display_name]))
  const labels = tierIds.map(id => tierMap.get(id) ?? id)
  return `Memberships: ${labels.join(', ')}`
}

function formatSquareSyncReason(reason: string | null | undefined) {
  if (!reason) return 'Not synced'
  if (reason === 'ok') return 'Synced'
  if (reason === 'missing_square_discount') return 'Not synced'
  if (reason === 'not_found') return 'Missing in Square'
  if (reason === 'deleted') return 'Deleted in Square'
  if (reason === 'not_discount') return 'Invalid Square object'
  if (reason === 'square_unavailable') return 'Square unavailable'
  return reason
}
</script>

<template>
  <UDashboardPanel
    id="admin-promos"
    class="min-h-0 flex-1 admin-ops-panel"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        title="Promo Code Management"
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
          icon="i-lucide-ticket-percent"
          title="Promo code controls"
          description="Create and manage promo rules, date windows, and redemption limits."
        />

        <div class="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <UCard>
            <div class="flex items-center justify-between">
              <div class="font-medium">
                Promo codes
              </div>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                @click="resetForm"
              >
                New promo
              </UButton>
            </div>
            <div class="mt-3 space-y-2">
              <div
                v-for="promo in promos"
                :key="promo.id"
                class="rounded-lg border border-default p-2"
                :class="selectedId === promo.id ? 'border-primary bg-elevated' : ''"
              >
                <button
                  class="w-full text-left"
                  @click="loadPromo(promo.id)"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium">{{ promo.code }}</span>
                    <UBadge
                      :color="promo.active ? 'success' : 'neutral'"
                      size="xs"
                      variant="soft"
                    >
                      {{ promo.active ? 'active' : 'inactive' }}
                    </UBadge>
                  </div>
                  <div class="mt-1 flex flex-wrap items-center gap-1 text-xs text-dimmed">
                    <span>{{ formatPromoValue(promo) }}</span>
                    <span>·</span>
                    <UBadge
                      size="xs"
                      variant="subtle"
                      color="neutral"
                      class="max-w-full whitespace-normal"
                    >
                      {{ formatPromoAppliesTo(promo) }}
                    </UBadge>
                    <UBadge
                      size="xs"
                      :color="promo.square_sync?.valid ? 'success' : 'warning'"
                      variant="soft"
                    >
                      {{ formatSquareSyncReason(promo.square_sync?.reason) }}
                    </UBadge>
                  </div>
                </button>
                <UButton
                  class="mt-2"
                  size="xs"
                  color="error"
                  variant="soft"
                  :loading="deletingId === promo.id"
                  @click="deletePromo(promo.id)"
                >
                  Delete
                </UButton>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Code">
                <UInput
                  v-model="form.code"
                  placeholder="SPRING20"
                />
              </UFormField>
              <UFormField label="Applies to">
                <USelect
                  v-model="form.appliesTo"
                  class="w-full"
                  :items="[
                    { label: 'All', value: 'all' },
                    { label: 'Membership', value: 'membership' },
                    { label: 'Credits', value: 'credits' },
                    { label: 'Holds', value: 'holds' }
                  ]"
                />
              </UFormField>
              <UFormField
                v-if="form.appliesTo === 'membership'"
                label="Membership tiers"
                class="md:col-span-2"
              >
                <div class="rounded-lg border border-default p-3">
                  <div
                    v-if="tiersPending"
                    class="text-xs text-dimmed"
                  >
                    Loading tiers...
                  </div>
                  <div
                    v-else-if="tiersError"
                    class="text-xs text-error"
                  >
                    Could not load tiers.
                  </div>
                  <div
                    v-else-if="!tierOptions.length"
                    class="text-xs text-dimmed"
                  >
                    No tiers found.
                  </div>
                  <div
                    v-else
                    class="grid gap-2 md:grid-cols-2"
                  >
                    <UCheckbox
                      v-for="tier in tierOptions"
                      :key="tier.id"
                      :model-value="form.appliesTierIds.includes(tier.id)"
                      :label="tier.display_name"
                      @update:model-value="(checked) => {
                        if (checked) {
                          if (!form.appliesTierIds.includes(tier.id)) form.appliesTierIds.push(tier.id)
                        }
                        else {
                          form.appliesTierIds = form.appliesTierIds.filter(id => id !== tier.id)
                        }
                      }"
                    />
                  </div>
                </div>
              </UFormField>
              <UFormField
                v-if="form.appliesTo === 'credits'"
                label="Credit packages"
                class="md:col-span-2"
              >
                <div class="rounded-lg border border-default p-3">
                  <div
                    v-if="creditOptionsPending"
                    class="text-xs text-dimmed"
                  >
                    Loading credit packages...
                  </div>
                  <div
                    v-else-if="creditOptionsError"
                    class="text-xs text-error"
                  >
                    Could not load credit packages.
                  </div>
                  <div
                    v-else-if="!creditOptions.length"
                    class="text-xs text-dimmed"
                  >
                    No active credit packages found.
                  </div>
                  <div
                    v-else
                    class="grid gap-2 md:grid-cols-2"
                  >
                    <UCheckbox
                      v-for="option in creditOptions"
                      :key="option.key"
                      :model-value="form.appliesCreditOptionKeys.includes(option.key)"
                      :label="option.label"
                      @update:model-value="(checked) => {
                        if (checked) {
                          if (!form.appliesCreditOptionKeys.includes(option.key)) form.appliesCreditOptionKeys.push(option.key)
                        }
                        else {
                          form.appliesCreditOptionKeys = form.appliesCreditOptionKeys.filter(key => key !== option.key)
                        }
                      }"
                    />
                  </div>
                  <p class="mt-2 text-xs text-dimmed">
                    Leave empty to apply this promo to all credit packages.
                  </p>
                </div>
              </UFormField>
              <UFormField
                label="Description"
                class="md:col-span-2"
              >
                <UInput
                  v-model="form.description"
                  placeholder="Spring campaign promo"
                />
              </UFormField>
              <UFormField label="Discount type">
                <USelect
                  v-model="form.discountType"
                  class="w-full"
                  :items="[
                    { label: 'Percent', value: 'percent' },
                    { label: 'Fixed amount ($)', value: 'fixed_cents' }
                  ]"
                />
              </UFormField>
              <UFormField :label="form.discountType === 'percent' ? 'Discount percent' : 'Discount amount ($)'">
                <UInput
                  v-if="form.discountType === 'percent'"
                  v-model.number="form.discountValue"
                  type="number"
                  min="0.01"
                  step="0.01"
                />
                <UFieldGroup v-else>
                  <UBadge
                    color="neutral"
                    variant="outline"
                    size="lg"
                    label="$"
                  />
                  <UInput
                    v-model.number="form.discountValue"
                    type="number"
                    min="0.01"
                    step="0.01"
                  />
                </UFieldGroup>
              </UFormField>
              <UFormField label="Starts at">
                <UInput
                  :model-value="toLocalInputValue(form.startsAt)"
                  type="datetime-local"
                  @update:model-value="(value) => { form.startsAt = fromLocalInputValue(String(value ?? '')) }"
                />
              </UFormField>
              <UFormField label="Ends at">
                <UInput
                  :model-value="toLocalInputValue(form.endsAt)"
                  type="datetime-local"
                  @update:model-value="(value) => { form.endsAt = fromLocalInputValue(String(value ?? '')) }"
                />
              </UFormField>
              <UFormField label="Max redemptions">
                <UInput
                  v-model.number="form.maxRedemptions"
                  type="number"
                  min="0"
                />
              </UFormField>
            </div>

            <div class="mt-4 flex items-center gap-4">
              <UCheckbox
                v-model="form.active"
                label="Active"
              />
            </div>

            <UAlert
              v-if="validationErrors.length"
              class="mt-4"
              color="warning"
              variant="soft"
              icon="i-lucide-circle-alert"
              :title="validationErrors[0]"
            />

            <UAlert
              v-if="selectedId && promos.find(p => p.id === selectedId)?.square_sync?.valid === false"
              class="mt-3"
              color="warning"
              variant="soft"
              icon="i-lucide-link-2-off"
              :title="`Square sync status: ${formatSquareSyncReason(promos.find(p => p.id === selectedId)?.square_sync?.reason)}`"
              description="Save this promo to re-sync its Square discount object."
            />

            <div class="mt-4">
              <UButton
                :loading="saving"
                :disabled="!canSave"
                @click="savePromo"
              >
                Save promo
              </UButton>
            </div>
          </UCard>
        </div>
      </AdminOpsShell>
    </template>
  </UDashboardPanel>
</template>
