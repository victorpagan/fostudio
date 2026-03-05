<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type PromoCode = {
  id: string
  code: string
  description: string | null
  discount_type: 'percent' | 'fixed_cents'
  discount_value: number
  applies_to: 'all' | 'membership' | 'credits'
  active: boolean
  starts_at: string | null
  ends_at: string | null
  max_redemptions: number | null
  redemptions_count: number
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
  appliesTo: 'all' as 'all' | 'membership' | 'credits',
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
  form.discountValue = Number(promo.discount_value)
  form.appliesTo = promo.applies_to
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

async function savePromo() {
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
</script>

<template>
  <UDashboardPanel id="admin-promos">
    <template #header>
      <UDashboardNavbar title="Promo Code Management" :ui="{ right: 'gap-2' }">
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
              <UButton size="xs" color="neutral" variant="soft" @click="resetForm">
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
                <button class="w-full text-left" @click="loadPromo(promo.id)">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium">{{ promo.code }}</span>
                    <UBadge :color="promo.active ? 'success' : 'neutral'" size="xs" variant="soft">
                      {{ promo.active ? 'active' : 'inactive' }}
                    </UBadge>
                  </div>
                  <div class="mt-1 text-xs text-dimmed">
                    {{ formatPromoValue(promo) }} · {{ promo.applies_to }}
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
                <UInput v-model="form.code" placeholder="SPRING20" />
              </UFormField>
              <UFormField label="Applies to">
                <USelect
                  v-model="form.appliesTo"
                  :items="[
                    { label: 'All', value: 'all' },
                    { label: 'Membership', value: 'membership' },
                    { label: 'Credits', value: 'credits' }
                  ]"
                />
              </UFormField>
              <UFormField label="Description" class="md:col-span-2">
                <UInput v-model="form.description" placeholder="Spring campaign promo" />
              </UFormField>
              <UFormField label="Discount type">
                <USelect
                  v-model="form.discountType"
                  :items="[
                    { label: 'Percent', value: 'percent' },
                    { label: 'Fixed cents', value: 'fixed_cents' }
                  ]"
                />
              </UFormField>
              <UFormField :label="form.discountType === 'percent' ? 'Discount percent' : 'Discount cents'">
                <UInput v-model.number="form.discountValue" type="number" min="0.01" step="0.01" />
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
                <UInput v-model.number="form.maxRedemptions" type="number" min="0" />
              </UFormField>
            </div>

            <div class="mt-4 flex items-center gap-4">
              <UCheckbox v-model="form.active" label="Active" />
            </div>

            <div class="mt-4">
              <UButton :loading="saving" @click="savePromo">
                Save promo
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
