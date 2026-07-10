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
const deactivateConfirmOpen = ref(false)
const deactivationTargets = ref<SquarePlanRow[]>([])

const { data, pending, refresh, error } = await useAsyncData('admin:square:plans', async () => {
  const res = await $fetch<{ plans: SquarePlanRow[] }>('/api/admin/square/subscription-plans')
  return res.plans
})

const plans = computed(() => data.value ?? [])
const allSelected = computed(() => plans.value.length > 0 && selectedPlanIds.value.length === plans.value.length)
const deactivationVariationCount = computed(() => deactivationTargets.value.reduce((total, plan) => total + plan.variationIds.length, 0))
const deactivationEligibleItemCount = computed(() => deactivationTargets.value.reduce((total, plan) => total + plan.eligibleItemIds.length, 0))
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

function openDeactivateConfirmation() {
  const selected = new Set(selectedPlanIds.value)
  deactivationTargets.value = plans.value.filter(plan => selected.has(plan.id))
  if (deactivationTargets.value.length === 0) return
  deactivateConfirmOpen.value = true
}

function closeDeactivateConfirmation() {
  if (deleting.value) return
  deactivateConfirmOpen.value = false
  deactivationTargets.value = []
}

async function deleteSelectedPlans() {
  const planIds = deactivationTargets.value.map(plan => plan.id)
  if (planIds.length === 0 || deleting.value) return
  deleting.value = true
  let completed = false
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
      body: { planIds }
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
    completed = true
  } catch (deleteError) {
    const message = deleteError instanceof Error ? deleteError.message : 'Deactivation failed'
    toast.add({
      title: 'Deactivation failed',
      description: message,
      color: 'error'
    })
  } finally {
    deleting.value = false
    if (completed) closeDeactivateConfirmation()
  }
}
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-square-plans-temp"
    title="Square Plan Cleanup (Temp)"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: 'Deactivate selected',
          icon: 'i-lucide-circle-off',
          color: 'warning',
          disabled: selectedPlanIds.length === 0,
          loading: deleting,
          onSelect: openDeactivateConfirmation
        }"
        :secondary="[
          {
            label: 'Refresh',
            icon: 'i-lucide-refresh-cw',
            color: 'neutral',
            variant: 'soft',
            loading: pending,
            onSelect: refresh
          }
        ]"
      />
    </template>
    <AppAlert
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

    <UModal
      v-model:open="deactivateConfirmOpen"
      title="Deactivate selected Square plans?"
      description="Confirm before deactivating the selected plans in Square and hiding their linked variations."
      :dismissible="!deleting"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold">
                  Deactivate selected Square plans?
                </h3>
                <p class="mt-1 text-xs text-dimmed">
                  Review the catalog objects before starting this bulk action.
                </p>
              </div>
              <UButton
                icon="i-lucide-x"
                aria-label="Close plan deactivation confirmation"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="deleting"
                @click="closeDeactivateConfirmation"
              />
            </div>
          </template>

          <div class="space-y-3">
            <div class="max-h-64 space-y-2 overflow-y-auto pr-1">
              <div
                v-for="plan in deactivationTargets"
                :key="plan.id"
                class="rounded-lg border border-default p-3 text-sm"
              >
                <div class="font-medium">
                  {{ plan.name }}
                </div>
                <div class="mt-1 break-all font-mono text-xs text-dimmed">
                  {{ plan.id }}
                </div>
                <div class="mt-1 text-xs text-dimmed">
                  {{ plan.variationIds.length }} variation(s) · {{ plan.eligibleItemIds.length }} eligible item(s)
                </div>
              </div>
            </div>

            <AppAlert
              color="warning"
              variant="soft"
              icon="i-lucide-circle-off"
              :title="`${deactivationTargets.length} plan(s) and ${deactivationVariationCount} variation(s) will be deactivated`"
              description="Square variations are processed first, followed by each subscription plan. This cannot be restored from this page."
            />
            <AppAlert
              color="neutral"
              variant="soft"
              icon="i-lucide-receipt-text"
              title="Existing subscriptions are not canceled"
              :description="`These catalog options will no longer be available for new subscriptions. This request does not cancel member subscriptions, issue refunds, or deactivate the ${deactivationEligibleItemCount} linked eligible item(s).`"
            />
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="deleting"
                @click="closeDeactivateConfirmation"
              >
                Keep plans active
              </UButton>
              <UButton
                color="warning"
                :loading="deleting"
                :disabled="deactivationTargets.length === 0"
                @click="deleteSelectedPlans"
              >
                Deactivate {{ deactivationTargets.length }} plan{{ deactivationTargets.length === 1 ? '' : 's' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </DashboardPageScaffold>
</template>
