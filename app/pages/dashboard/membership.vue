<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

type MembershipRow = {
  id: string
  tier: string | null
  cadence: string | null
  status: string | null
  created_at: string | null
  square_plan_variation_id: string | null
}

type TierRow = {
  display_name: string
  description: string | null
  booking_window_days: number | null
  peak_multiplier: number | null
  max_bank: number | null
  holds_included: boolean | null
}

type PlanVariation = {
  cadence: string
  credits_per_month: number | null
  price_cents: number | null
  currency: string | null
  discount_label: string | null
}

const { data: membership, refresh } = await useAsyncData('dash:membership', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('id, tier, cadence, status, created_at, square_plan_variation_id')
    .eq('user_id', user.value.id)
    .maybeSingle()
  if (error) throw error
  return data as MembershipRow | null
})

const { data: tier } = await useAsyncData('dash:tier', async () => {
  if (!membership.value?.tier) return null
  const { data, error } = await supabase
    .from('membership_tiers')
    .select('display_name, description, booking_window_days, peak_multiplier, max_bank, holds_included')
    .eq('id', membership.value.tier)
    .maybeSingle()
  if (error) throw error
  return data as TierRow | null
}, { watch: [membership] })

const { data: variations } = await useAsyncData('dash:variations', async () => {
  if (!membership.value?.tier) return []
  const { data, error } = await supabase
    .from('membership_plan_variations')
    .select('cadence, credits_per_month, price_cents, currency, discount_label')
    .eq('tier_id', membership.value.tier)
    .eq('provider', 'square')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as PlanVariation[]
}, { watch: [membership] })

const membershipState = computed(() => {
  const s = (membership.value?.status ?? '').toLowerCase()
  if (s === 'active') return 'active'
  if (s === 'pending_checkout') return 'pending_checkout'
  if (s === 'canceled' || s === 'cancelled') return 'canceled'
  if (s === 'past_due') return 'past_due'
  if (!s) return 'none'
  return 'inactive'
})

const statusColor = computed(() => {
  switch (membershipState.value) {
    case 'active': return 'success'
    case 'pending_checkout': return 'warning'
    case 'past_due': return 'error'
    case 'canceled': return 'neutral'
    default: return 'neutral'
  }
})

const currentVariation = computed(() =>
  variations.value?.find(v => v.cadence === membership.value?.cadence) ?? null
)

function formatPrice(cents: number | null, currency = 'USD') {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function formatCadence(c: string | null) {
  switch (c) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly (3 months)'
    case 'annual': return 'Annual'
    default: return c ?? '—'
  }
}

function memberSince(createdAt: string | null) {
  if (!createdAt) return '—'
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
</script>

<template>
  <UDashboardPanel id="membership">
    <template #header>
      <UDashboardNavbar title="Membership" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-refresh-cw" @click="() => refresh()" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <!-- No membership -->
        <template v-if="membershipState === 'none'">
          <UCard>
            <div class="text-center py-6">
              <UIcon name="i-lucide-badge-x" class="size-12 text-dimmed mx-auto mb-3" />
              <h2 class="text-lg font-semibold">No membership yet</h2>
              <p class="mt-2 text-sm text-dimmed max-w-xs mx-auto">
                Choose a plan to get started. Credits are minted when your first invoice is paid.
              </p>
              <UButton class="mt-4" to="/memberships">View plans</UButton>
            </div>
          </UCard>
        </template>

        <!-- Pending checkout -->
        <template v-else-if="membershipState === 'pending_checkout'">
          <UAlert
            color="warning"
            variant="soft"
            title="Checkout not completed"
            description="Your membership is reserved but payment hasn't been processed yet."
            :actions="[{ label: 'Finish checkout', to: '/memberships' }]"
          />
        </template>

        <!-- Active or other states -->
        <template v-else>
          <!-- Status banner -->
          <UAlert
            v-if="membershipState !== 'active'"
            :color="statusColor"
            variant="soft"
            :title="membershipState === 'past_due' ? 'Payment past due' : 'Membership inactive'"
            description="Please update your payment method or contact support."
            :actions="[{ label: 'Manage billing', to: '/memberships' }]"
          />

          <!-- Plan summary -->
          <div class="grid gap-4 md:grid-cols-2">
            <UCard>
              <div class="space-y-3">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="text-xs text-dimmed uppercase tracking-wide">Current plan</div>
                    <div class="mt-1 text-xl font-semibold">{{ tier?.display_name ?? membership?.tier ?? '—' }}</div>
                  </div>
                  <UBadge :color="statusColor" variant="soft">{{ membership?.status }}</UBadge>
                </div>

                <p v-if="tier?.description" class="text-sm text-dimmed">{{ tier.description }}</p>

                <div class="pt-2 border-t border-default space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-dimmed">Billing cycle</span>
                    <span>{{ formatCadence(membership?.cadence ?? null) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-dimmed">Monthly price</span>
                    <span>{{ formatPrice(currentVariation?.price_cents ?? null) }}/mo</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-dimmed">Credits / month</span>
                    <span>{{ currentVariation?.credits_per_month ?? '—' }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-dimmed">Member since</span>
                    <span>{{ memberSince(membership?.created_at ?? null) }}</span>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Tier features -->
            <UCard>
              <div class="space-y-3">
                <div class="text-xs text-dimmed uppercase tracking-wide">Plan features</div>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-dimmed">Booking window</span>
                    <span>{{ tier?.booking_window_days ?? '—' }} days</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-dimmed">Peak multiplier</span>
                    <span>{{ tier?.peak_multiplier ?? '—' }}×</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-dimmed">Max credit bank</span>
                    <span>{{ tier?.max_bank ?? '—' }} credits</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-dimmed">Equipment holds</span>
                    <UBadge
                      :color="tier?.holds_included ? 'success' : 'neutral'"
                      variant="soft"
                      size="sm"
                    >
                      {{ tier?.holds_included ? 'Included' : 'Extra' }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Other cadence options for this tier -->
          <UCard v-if="(variations?.length ?? 0) > 1">
            <div class="space-y-3">
              <div class="text-sm font-medium">Other billing options for {{ tier?.display_name }}</div>
              <div class="grid gap-2 sm:grid-cols-3">
                <div
                  v-for="v in variations"
                  :key="v.cadence"
                  class="rounded-lg border p-3 text-sm"
                  :class="v.cadence === membership?.cadence ? 'border-primary bg-primary/5' : 'border-default'"
                >
                  <div class="font-medium flex items-center gap-1">
                    {{ formatCadence(v.cadence) }}
                    <UBadge v-if="v.cadence === membership?.cadence" color="primary" size="xs" variant="soft">Current</UBadge>
                    <UBadge v-if="v.discount_label" color="success" size="xs" variant="soft">{{ v.discount_label }}</UBadge>
                  </div>
                  <div class="text-dimmed mt-1">{{ formatPrice(v.price_cents) }}/mo · {{ v.credits_per_month }} cr/mo</div>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Actions -->
          <UCard>
            <div class="text-sm font-medium mb-3">Manage membership</div>
            <div class="flex flex-wrap gap-2">
              <UButton color="neutral" variant="soft" to="/memberships" icon="i-lucide-arrow-up-circle">
                Upgrade plan
              </UButton>
              <UButton color="neutral" variant="ghost" icon="i-lucide-external-link" target="_blank">
                Manage billing (Square)
              </UButton>
            </div>
            <p class="mt-3 text-xs text-dimmed">
              Billing is managed via Square. Contact us to cancel or change your plan. Cancellations take effect at the end of your billing cycle.
            </p>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
