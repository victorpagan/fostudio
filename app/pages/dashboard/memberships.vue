<script setup lang="ts">
import { getMembershipPlanDetails } from '~~/app/utils/membershipPlanDetails'
import { normalizeDiscountLabel } from '~~/app/utils/membershipDiscount'
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const toast = useToast()

type MembershipRow = {
  tier: string | null
  cadence: string | null
  status: string | null
  current_period_end: string | null
  canceled_at: string | null
}

type PlanVariation = {
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
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
  max_slots: number | null
  cap: number | null
  active_members: number
  spots_left: number | null
  is_full: boolean
  holds_included: number
  adminOnly?: boolean
  membership_plan_variations: PlanVariation[]
}

const { data: membership } = await useAsyncData('dash:browse:membership', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('tier,cadence,status,current_period_end,canceled_at')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as MembershipRow | null
})

const { data: catalog, refresh, pending: catalogPending, error: catalogError } = await useAsyncData('dash:browse:catalog', async () => {
  const res = await $fetch<{ tiers: CatalogTier[] }>('/api/membership/catalog')
  return res?.tiers ?? []
})

const tiers = computed(() => catalog.value ?? [])
const membershipState = computed(() => resolveMembershipUiState(membership.value))
const hasActiveMembership = computed(() => membershipState.value === 'active')
const hasPriorityMembership = computed(() => {
  const status = membershipState.value
  return status === 'active' || status === 'past_due'
})
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

const waitlistOpen = ref(false)
const waitlistSubmitting = ref(false)
const waitlistTierId = ref<string | null>(null)
const waitlistCadence = ref<PlanVariation['cadence']>('monthly')
const waitlistPhone = ref('')
const waitlistEmail = computed(() => user.value?.email ?? '')

function formatPeakCredits(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function formatCadence(value: string) {
  if (value === 'daily') return 'Daily'
  if (value === 'weekly') return 'Weekly'
  if (value === 'monthly') return 'Monthly'
  if (value === 'quarterly') return 'Quarterly'
  if (value === 'annual') return 'Annual'
  return value
}

function creditsCycleAbbrev(cadence: string) {
  if (cadence === 'daily') return 'cr/day'
  if (cadence === 'weekly') return 'cr/week'
  return 'cr/mo'
}

function getDiscountLabel(label?: string | null) {
  return normalizeDiscountLabel(label)
}

function formatPrice(cents: number | null, currency: string | null) {
  if (typeof cents !== 'number') return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency ?? 'USD' }).format(cents / 100)
}

function goToPlan(tierId: string, cadence: PlanVariation['cadence']) {
  const returnTo = encodeURIComponent('/dashboard/membership')
  const base = `/checkout?tier=${encodeURIComponent(tierId)}&cadence=${encodeURIComponent(cadence)}&returnTo=${returnTo}`
  if (hasPriorityMembership.value) {
    router.push(`${base}&mode=switch`)
    return
  }
  router.push(base)
}

function isTierBlockedForNewMembers(tier: CatalogTier) {
  return tier.is_full && !hasPriorityMembership.value
}

function openWaitlist(tierId: string, cadence: PlanVariation['cadence']) {
  waitlistTierId.value = tierId
  waitlistCadence.value = cadence
  waitlistPhone.value = ''
  waitlistOpen.value = true
}

async function submitWaitlist() {
  if (!waitlistTierId.value) return

  waitlistSubmitting.value = true
  try {
    const res = await $fetch<{ message: string }>('/api/membership/waitlist', {
      method: 'POST',
      body: {
        tier: waitlistTierId.value,
        cadence: waitlistCadence.value,
        phone: waitlistPhone.value.trim() || undefined
      }
    })
    toast.add({
      title: 'Waitlist updated',
      description: res.message,
      color: 'success'
    })
    waitlistOpen.value = false
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Could not join waitlist',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Unknown error',
      color: 'error'
    })
  } finally {
    waitlistSubmitting.value = false
  }
}

function isCurrentPlan(tierId: string, cadence: PlanVariation['cadence']) {
  return hasPriorityMembership.value && membership.value?.tier === tierId && membership.value?.cadence === cadence
}

function openTierDetails(tierId: string) {
  detailsTierId.value = tierId
  detailsOpen.value = true
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <UDashboardPanel
      id="memberships"
      class="min-h-0 flex-1"
    >
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
              @click="() => refresh()"
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="p-4 space-y-4">
          <UAlert
            v-if="catalogError"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="Could not load memberships"
            :description="catalogError.message"
          />

          <UAlert
            v-else-if="!catalogPending && !tiers.length"
            color="warning"
            variant="soft"
            icon="i-lucide-search-x"
            title="No memberships available"
            description="No visible membership tiers were returned for this account."
          />

          <UAlert
            v-if="hasActiveMembership"
            color="neutral"
            variant="soft"
            icon="i-lucide-calendar-clock"
            title="Membership changes apply next cycle"
            description="Upgrades and downgrades are scheduled for your next billing cycle. Mid-cycle prorated membership changes are not applied."
          />

          <div
            v-if="tiers.length"
            class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <UCard
              v-for="tier in tiers"
              :key="tier.id"
              :ui="{body:'h-full flex flex-col justify-between'}"
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
                  <UBadge
                    v-if="tier.is_full"
                    color="error"
                    variant="soft"
                    size="xs"
                  >
                    Waitlist open
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
                    <span>Credit cap</span>
                    <span class="font-medium text-default">{{ tier.max_bank }} credits</span>
                  </li>
                  <li class="flex justify-between">
                    <span>Capacity</span>
                    <span class="font-medium text-default">
                      {{ tier.cap === null ? 'Unlimited' : `${Math.max(0, tier.spots_left ?? 0)} available` }}
                    </span>
                  </li>
                </ul>
              </div>

              <div class="space-y-2 pt-4">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-info"
                  @click="openTierDetails(tier.id)"
                >
                  See full plan breakdown
                </UButton>
                  <USeparator />
                <div
                  v-for="plan in tier.membership_plan_variations"
                  :key="`${tier.id}-${plan.cadence}`"
                  class="rounded-lg border border-default p-3"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-sm">
                      <span class="font-medium">{{ formatCadence(plan.cadence) }}</span>
                      <span class="text-dimmed"> · {{ plan.credits_per_month ?? '—' }} {{ creditsCycleAbbrev(plan.cadence) }}</span>
                      <UBadge
                        v-if="getDiscountLabel(plan.discount_label)"
                        color="success"
                        variant="soft"
                        size="xs"
                        class="ml-1"
                      >
                        {{ getDiscountLabel(plan.discount_label) }}
                      </UBadge>
                    </div>
                    <div class="text-sm font-medium">
                      {{ formatPrice(plan.price_cents, plan.currency) }}
                    </div>
                  </div>

                  <UButton
                    v-if="!isTierBlockedForNewMembers(tier)"
                    class="mt-3"
                    size="xs"
                    block
                    :disabled="isCurrentPlan(tier.id, plan.cadence)"
                    @click="goToPlan(tier.id, plan.cadence)"
                  >
                    {{ isCurrentPlan(tier.id, plan.cadence)
                      ? 'Current plan'
                      : (hasPriorityMembership ? `Schedule ${formatCadence(plan.cadence)}` : `Choose ${formatCadence(plan.cadence)}`) }}
                  </UButton>
                  <UButton
                    v-else
                    class="mt-3"
                    size="xs"
                    block
                    color="neutral"
                    variant="soft"
                    @click="openWaitlist(tier.id, plan.cadence)"
                  >
                    Join waitlist
                  </UButton>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </template>
    </UDashboardPanel>

    <UModal
      v-model:open="waitlistOpen"
      :dismissible="true"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-semibold">
                  Join waitlist
                </div>
                <p class="mt-1 text-sm text-dimmed">
                  We will email {{ waitlistEmail || 'you' }} when a spot opens.
                </p>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="waitlistOpen = false"
              />
            </div>
          </template>

          <div class="space-y-3">
            <UFormField label="Email">
              <UInput
                :model-value="waitlistEmail"
                type="email"
                disabled
              />
            </UFormField>
            <UFormField label="Phone (optional)">
              <UInput
                v-model="waitlistPhone"
                placeholder="(555) 123-4567"
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                @click="waitlistOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                :loading="waitlistSubmitting"
                @click="submitWaitlist"
              >
                Join waitlist
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

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
