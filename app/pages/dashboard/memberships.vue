<script setup lang="ts">
import { getMembershipPlanDetails } from '~~/app/utils/membershipPlanDetails'

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()

type MembershipRow = {
  tier: string | null
  cadence: string | null
  status: string | null
}

type PlanVariation = {
  cadence: 'monthly' | 'quarterly' | 'annual'
  credits_per_month: number | null
  price_cents: number | null
  currency: string | null
  discount_label: string | null
}

type CatalogTier = {
  id: string
  display_name: string
  description?: string | null
  booking_window_days: number
  peak_multiplier: number
  max_bank: number
  holds_included: number
  adminOnly?: boolean
  membership_plan_variations: PlanVariation[]
}

const { data: membership } = await useAsyncData('dash:browse:membership', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('tier,cadence,status')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as MembershipRow | null
})

const { data: catalog, refresh } = await useAsyncData('dash:browse:catalog', async () => {
  const res = await $fetch<{ tiers: CatalogTier[] }>('/api/membership/catalog')
  return res?.tiers ?? []
})

const tiers = computed(() => catalog.value ?? [])
const hasActiveMembership = computed(() => (membership.value?.status ?? '').toLowerCase() === 'active')
const detailsOpen = ref(false)
const detailsTierId = ref<string | null>(null)

const selectedTier = computed(() => {
  if (!detailsTierId.value) return null
  return tiers.value.find(tier => tier.id === detailsTierId.value) ?? null
})

const selectedTierDetails = computed(() => {
  if (!selectedTier.value) return null
  return getMembershipPlanDetails(selectedTier.value.id, selectedTier.value.display_name)
})

function formatPeakCredits(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function formatCadence(value: string) {
  if (value === 'monthly') return 'Monthly'
  if (value === 'quarterly') return 'Quarterly'
  if (value === 'annual') return 'Annual'
  return value
}

function formatPrice(cents: number | null, currency: string | null) {
  if (typeof cents !== 'number') return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency ?? 'USD' }).format(cents / 100)
}

function goToPlan(tierId: string, cadence: PlanVariation['cadence']) {
  const returnTo = encodeURIComponent('/dashboard/membership')
  const base = `/checkout?tier=${encodeURIComponent(tierId)}&cadence=${encodeURIComponent(cadence)}&returnTo=${returnTo}`
  if (hasActiveMembership.value) {
    router.push(`${base}&mode=switch`)
    return
  }
  router.push(base)
}

function isCurrentPlan(tierId: string, cadence: PlanVariation['cadence']) {
  return hasActiveMembership.value && membership.value?.tier === tierId && membership.value?.cadence === cadence
}

function openTierDetails(tierId: string) {
  detailsTierId.value = tierId
  detailsOpen.value = true
}
</script>

<template>
  <div>
    <UDashboardPanel id="memberships">
      <template #header>
        <UDashboardNavbar title="Browse Memberships">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-refresh-cw"
              @click="refresh"
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="p-4 space-y-4">
          <UAlert
            v-if="hasActiveMembership"
            color="neutral"
            variant="soft"
            icon="i-lucide-calendar-clock"
            title="Membership changes apply next cycle"
            description="Upgrades and downgrades are scheduled for your next billing cycle. Mid-cycle prorated membership changes are not applied."
          />

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <UCard
              v-for="tier in tiers"
              :key="tier.id"
            >
              <div class="space-y-3">
                <div class="flex items-center gap-2">
                  <div class="font-semibold text-base">
                    {{ tier.display_name }}
                  </div>
                  <UBadge
                    v-if="tier.adminOnly"
                    color="warning"
                    variant="soft"
                    size="xs"
                  >
                    Admin only
                  </UBadge>
                </div>
                <p
                  v-if="tier.description"
                  class="text-sm text-dimmed"
                >
                  {{ tier.description }}
                </p>

                <ul class="text-sm space-y-1.5 text-dimmed">
                  <li class="flex justify-between">
                    <span>Booking window</span>
                    <span class="font-medium text-default">{{ tier.booking_window_days }}d</span>
                  </li>
                  <li class="flex justify-between">
                    <span>Peak-hour rate</span>
                    <span class="font-medium text-default">{{ formatPeakCredits(tier.peak_multiplier) }} credits/hr</span>
                  </li>
                  <li class="flex justify-between">
                    <span>Max bank</span>
                    <span class="font-medium text-default">{{ tier.max_bank }} credits</span>
                  </li>
                </ul>

                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-info"
                  @click="openTierDetails(tier.id)"
                >
                  See full plan breakdown
                </UButton>
              </div>

              <div class="mt-4 space-y-2 border-t border-default pt-4">
                <div
                  v-for="plan in tier.membership_plan_variations"
                  :key="`${tier.id}-${plan.cadence}`"
                  class="rounded-lg border border-default p-3"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-sm">
                      <span class="font-medium">{{ formatCadence(plan.cadence) }}</span>
                      <span class="text-dimmed"> · {{ plan.credits_per_month ?? '—' }} cr/mo</span>
                      <UBadge
                        v-if="plan.discount_label"
                        color="success"
                        variant="soft"
                        size="xs"
                        class="ml-1"
                      >
                        {{ plan.discount_label }}
                      </UBadge>
                    </div>
                    <div class="text-sm font-medium">
                      {{ formatPrice(plan.price_cents, plan.currency) }}
                    </div>
                  </div>

                  <UButton
                    class="mt-3"
                    size="xs"
                    block
                    :disabled="isCurrentPlan(tier.id, plan.cadence)"
                    @click="goToPlan(tier.id, plan.cadence)"
                  >
                    {{ isCurrentPlan(tier.id, plan.cadence)
                      ? 'Current plan'
                      : (hasActiveMembership ? `Schedule ${formatCadence(plan.cadence)}` : `Choose ${formatCadence(plan.cadence)}`) }}
                  </UButton>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </template>
    </UDashboardPanel>

    <UModal
      v-model:open="detailsOpen"
      :dismissible="true"
    >
      <template #content>
        <UCard v-if="selectedTierDetails">
          <template #header>
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-semibold">
                  {{ selectedTierDetails.title }}
                </div>
                <p class="mt-1 text-sm text-dimmed">
                  {{ selectedTierDetails.summary }}
                </p>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="detailsOpen = false"
              />
            </div>
          </template>

          <div class="space-y-4">
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed mb-2">
                Best for
              </div>
              <ul class="space-y-1 text-sm">
                <li
                  v-for="item in selectedTierDetails.bestFor"
                  :key="item"
                >
                  • {{ item }}
                </li>
              </ul>
            </div>

            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed mb-2">
                Plan benefits
              </div>
              <ul class="space-y-1 text-sm">
                <li
                  v-for="item in selectedTierDetails.benefits"
                  :key="item"
                >
                  • {{ item }}
                </li>
              </ul>
            </div>

            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed mb-2">
                Included
              </div>
              <ul class="space-y-1 text-sm">
                <li
                  v-for="item in selectedTierDetails.includes"
                  :key="item"
                >
                  • {{ item }}
                </li>
              </ul>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
