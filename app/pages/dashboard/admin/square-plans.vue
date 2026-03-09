<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type SquarePlanRow = {
  id: string
  name: string
  variationIds: string[]
  eligibleItemIds: string[]
  createdAt: string | null
  updatedAt: string | null
}

const toast = useToast()
const selectedPlanIds = ref<string[]>([])
const deleting = ref(false)

const { data, pending, refresh, error } = await useAsyncData('admin:square:plans', async () => {
  const res = await $fetch<{ plans: SquarePlanRow[] }>('/api/admin/square/subscription-plans')
  return res.plans
})

const plans = computed(() => data.value ?? [])
const allSelected = computed(() => plans.value.length > 0 && selectedPlanIds.value.length === plans.value.length)
const loadErrorMessage = computed(() => {
  const message = error.value?.message?.trim()
  return message || 'Failed to load plans.'
})

function isPlanSelected(planId: string) {
  return selectedPlanIds.value.includes(planId)
}

function setPlanSelected(planId: string, checked: boolean | 'indeterminate') {
  const shouldSelect = checked === true
  if (shouldSelect) {
    if (!selectedPlanIds.value.includes(planId)) {
      selectedPlanIds.value = [...selectedPlanIds.value, planId]
    }
    return
  }
  selectedPlanIds.value = selectedPlanIds.value.filter(id => id !== planId)
}

function toggleAll() {
  if (allSelected.value) {
    selectedPlanIds.value = []
    return
  }
  selectedPlanIds.value = plans.value.map(plan => plan.id)
}

function formatDate(value: string | null) {
  if (!value) return 'Unknown'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

async function deleteSelectedPlans() {
  if (selectedPlanIds.value.length === 0 || deleting.value) return
  deleting.value = true
  try {
    const response = await $fetch<{
      ok: boolean
      deactivated: number
      failed: number
      results: Array<{
        planId: string
        ok: boolean
        error?: string
        blockedVariations?: Array<{ variationId: string, reason: string }>
      }>
    }>('/api/admin/square/subscription-plans.delete', {
      method: 'POST',
      body: { planIds: selectedPlanIds.value }
    })

    if (response.deactivated > 0) {
      toast.add({
        title: `Deactivated ${response.deactivated} plan${response.deactivated === 1 ? '' : 's'}`,
        color: 'success'
      })
    }

    if (response.failed > 0) {
      const firstFailure = response.results.find(row => !row.ok)
      const blockedVariationCount = firstFailure?.blockedVariations?.length ?? 0
      const blockedSummary = blockedVariationCount > 0
        ? ` (${blockedVariationCount} blocked variation${blockedVariationCount === 1 ? '' : 's'})`
        : ''
      toast.add({
        title: `${response.failed} plan${response.failed === 1 ? '' : 's'} failed to deactivate`,
        description: firstFailure
          ? `[${firstFailure.planId}] ${firstFailure.error ?? 'Deactivate failed'}${blockedSummary}`
          : 'One or more plans failed to deactivate',
        color: 'error'
      })
    }

    selectedPlanIds.value = []
    await refresh()
  } catch (deleteError) {
    const message = deleteError instanceof Error ? deleteError.message : 'Delete failed'
    toast.add({
      title: 'Delete failed',
      description: message,
      color: 'error'
    })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="admin-square-plans-temp">
    <template #header>
      <UDashboardNavbar
        title="Square Plan Cleanup (Temp)"
        :ui="{ right: 'gap-2' }"
      >
        <template #right>
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="refresh()"
          >
            Refresh
          </UButton>
          <UButton
            color="warning"
            :disabled="selectedPlanIds.length === 0"
            :loading="deleting"
            icon="i-lucide-circle-off"
            @click="deleteSelectedPlans"
          >
            Deactivate selected
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="Temporary admin page"
          description="Deactivates selected Square subscription plan variations first, then deactivates the plan."
        />

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div class="font-medium">
                Subscription plans in Square
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                @click="toggleAll"
              >
                {{ allSelected ? 'Clear selection' : 'Select all' }}
              </UButton>
            </div>
          </template>

          <div
            v-if="error"
            class="text-sm text-error"
          >
            {{ loadErrorMessage }}
          </div>

          <div
            v-else-if="pending"
            class="text-sm text-dimmed"
          >
            Loading plans...
          </div>

          <div
            v-else-if="plans.length === 0"
            class="text-sm text-dimmed"
          >
            No subscription plans found.
          </div>

          <div
            v-else
            class="space-y-3"
          >
            <div
              v-for="plan in plans"
              :key="plan.id"
              class="rounded-lg ring ring-default p-3"
            >
              <div class="flex items-start gap-3">
                <UCheckbox
                  :model-value="isPlanSelected(plan.id)"
                  :label="plan.name"
                  @update:model-value="(value) => setPlanSelected(plan.id, value)"
                />
                <div class="min-w-0 flex-1 text-sm space-y-1">
                  <div class="font-mono text-xs text-dimmed break-all">
                    {{ plan.id }}
                  </div>
                  <div class="text-xs text-dimmed">
                    {{ plan.variationIds.length }} variation(s) • {{ plan.eligibleItemIds.length }} eligible item(s)
                  </div>
                  <div class="text-xs text-dimmed">
                    Updated {{ formatDate(plan.updatedAt) }}
                  </div>
                  <div class="flex flex-wrap gap-1 pt-1">
                    <UBadge
                      v-for="variationId in plan.variationIds"
                      :key="variationId"
                      color="neutral"
                      variant="outline"
                      size="sm"
                    >
                      {{ variationId }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
