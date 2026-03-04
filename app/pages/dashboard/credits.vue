<script setup lang="ts">
// auth only — handle no-membership state inline so the page stays in the dashboard
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin } = useCurrentUser()
const router = useRouter()

type LedgerRow = {
  id: string
  delta: number
  reason: string
  external_ref: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

type PlanOption = {
  cadence: 'monthly' | 'quarterly' | 'annual'
  credits_per_month: number
  price_cents: number
  currency: string
  discount_label?: string | null
}

type Tier = {
  id: string
  display_name: string
  description?: string | null
  booking_window_days: number
  peak_multiplier: number
  max_bank: number
  holds_included: number
  adminOnly?: boolean
  membership_plan_variations: PlanOption[]
}

// ── Membership status check ────────────────────────────────────────────────
const { data: membershipData } = await useAsyncData('credits:membership', async () => {
  if (!user.value) return null
  const { data } = await supabase
    .from('memberships')
    .select('status, tier, cadence')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  return data
})

const hasMembership = computed(() =>
  isAdmin.value || (membershipData.value?.status ?? '').toLowerCase() === 'active'
)

// ── Tier catalog (only loaded when no active membership) ───────────────────
const { data: tierCatalog } = await useAsyncData('credits:tiers', async () => {
  if (hasMembership.value) return []
  const res = await $fetch<{ tiers: Tier[] }>('/api/membership/catalog')
  return res?.tiers ?? []
}, { watch: [hasMembership] })

function goCheckout(tierId: string, cadence: string) {
  router.push(`/checkout?tier=${tierId}&cadence=${cadence}&returnTo=/dashboard/credits`)
}

// ── Balance + ledger (only when membership active) ─────────────────────────
const { data: balance, refresh: refreshBalance } = await useAsyncData('creditBalance', async () => {
  if (!user.value || !hasMembership.value) return 0
  const { data, error } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data?.balance ?? 0
})

const { data: ledger, refresh: refreshLedger } = await useAsyncData('creditLedger', async () => {
  if (!user.value || !hasMembership.value) return []
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('id,delta,reason,external_ref,created_at,metadata')
    .eq('user_id', user.value.sub)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as LedgerRow[]
})

function formatReason(r: string) {
  switch ((r || '').toLowerCase()) {
    case 'subscription_invoice_paid':
    case 'subscription_credit_grant':
      return 'Membership credits'
    case 'topoff': return 'Top-off'
    case 'booking_burn': return 'Booking used'
    case 'expiration': return 'Expired'
    case 'admin_adjustment': return 'Adjustment'
    default: return r
  }
}

function formatDelta(d: number) {
  return d > 0 ? `+${d}` : `${d}`
}

function formatPrice(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function formatCadence(c: string) {
  switch (c) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly'
    case 'annual': return 'Annual'
    default: return c
  }
}

async function refreshAll() {
  await Promise.all([refreshBalance(), refreshLedger()])
}
</script>

<template>
  <UDashboardPanel id="credits">
    <template #header>
      <UDashboardNavbar title="Credits" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton v-if="hasMembership" color="neutral" variant="soft" size="sm" icon="i-lucide-refresh-cw" @click="refreshAll">
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">

        <!-- ── No active membership: inline upsell ─────────────────────── -->
        <template v-if="!hasMembership">
          <UAlert
            color="primary"
            variant="soft"
            icon="i-lucide-coins"
            title="No active membership"
            description="Credits are purchased with a membership subscription. Choose a plan below to get started."
          />

          <div v-if="tierCatalog?.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <UCard
              v-for="tier in tierCatalog"
              :key="tier.id"
              class="flex flex-col"
            >
              <div class="flex-1 space-y-3">
                <div class="flex items-center gap-2">
                <div class="font-semibold text-base">{{ tier.display_name }}</div>
                <UBadge v-if="tier.adminOnly" color="warning" variant="soft" size="xs" icon="i-lucide-flask-conical">Admin only</UBadge>
              </div>
                <p v-if="tier.description" class="text-sm text-dimmed">{{ tier.description }}</p>
                <ul class="text-sm space-y-1 text-dimmed">
                  <li class="flex justify-between">
                    <span>Booking window</span>
                    <span class="font-medium text-default">{{ tier.booking_window_days }}d</span>
                  </li>
                  <li class="flex justify-between">
                    <span>Peak multiplier</span>
                    <span class="font-medium text-default">{{ tier.peak_multiplier }}×</span>
                  </li>
                  <li class="flex justify-between">
                    <span>Max credit bank</span>
                    <span class="font-medium text-default">{{ tier.max_bank }} cr</span>
                  </li>
                  <li class="flex justify-between">
                    <span>Equipment holds</span>
                    <UBadge
                      :color="tier.holds_included ? 'success' : 'neutral'"
                      variant="soft"
                      size="xs"
                    >{{ tier.holds_included ? 'Included' : 'Extra' }}</UBadge>
                  </li>
                </ul>
              </div>

              <div class="mt-4 space-y-2 border-t border-default pt-4">
                <div
                  v-for="plan in tier.membership_plan_variations"
                  :key="plan.cadence"
                  class="flex items-center justify-between gap-2"
                >
                  <div class="text-sm">
                    <span class="font-medium">{{ formatCadence(plan.cadence) }}</span>
                    <span class="text-dimmed"> · {{ plan.credits_per_month }} cr/mo</span>
                    <UBadge v-if="plan.discount_label" color="success" variant="soft" size="xs" class="ml-1">
                      {{ plan.discount_label }}
                    </UBadge>
                  </div>
                  <UButton size="xs" @click="goCheckout(tier.id, plan.cadence)">
                    {{ formatPrice(plan.price_cents) }}/mo
                  </UButton>
                </div>
              </div>
            </UCard>
          </div>

          <div v-else class="flex items-center justify-center py-10">
            <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-dimmed" />
          </div>
        </template>

        <!-- ── Active membership: balance + ledger ─────────────────────── -->
        <template v-else>
          <div class="grid gap-4 md:grid-cols-3">
            <UCard class="md:col-span-1">
              <div class="text-sm text-muted">Current balance</div>
              <div class="mt-2 text-4xl font-semibold">
                {{ balance }}
              </div>
              <div class="mt-2 text-xs text-dimmed">
                Credits are added by membership payments and top-offs, and deducted by bookings/holds.
              </div>

              <div class="mt-4 flex gap-2">
                <UButton size="sm" to="/dashboard/membership">Manage membership</UButton>
                <UButton size="sm" color="neutral" variant="soft" to="/dashboard/book">Book studio</UButton>
              </div>
            </UCard>

            <UCard class="md:col-span-2">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-sm text-muted">Recent activity</div>
                  <div class="mt-1 text-xs text-dimmed">Newest first</div>
                </div>
              </div>

              <div v-if="!ledger?.length" class="mt-4 text-sm text-dimmed">
                No credit activity yet. Once your membership invoice is processed, credits will appear here.
              </div>

              <div v-else class="mt-4 divide-y divide-default">
                <div
                  v-for="row in ledger"
                  :key="row.id"
                  class="py-3 flex items-start justify-between gap-4"
                >
                  <div class="min-w-0">
                    <div class="text-sm font-medium truncate">
                      {{ formatReason(row.reason) }}
                    </div>
                    <div class="mt-1 text-xs text-dimmed">
                      {{ new Date(row.created_at).toLocaleString() }}
                      <span v-if="row.external_ref"> · ref: {{ row.external_ref }}</span>
                    </div>
                  </div>

                  <div class="text-right shrink-0">
                    <div
                      class="text-sm font-semibold"
                      :class="row.delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                    >
                      {{ formatDelta(row.delta) }}
                    </div>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <UCard>
            <div class="text-sm text-muted">Rollover & expiration</div>
            <div class="mt-2 text-sm text-dimmed">
              Credits rollover up to your tier's maximum bank. Excess credits expire at the end of each billing cycle.
            </div>
          </UCard>
        </template>

      </div>
    </template>
  </UDashboardPanel>
</template>
