<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'membership-required']
})

const supabase = useSupabaseClient()
const user = useSupabaseUser()

// Manually typed until supabase type gen includes studio tables
type LedgerRow = {
  id: string
  delta: number
  reason: string
  external_ref: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

const { data: balance, refresh: refreshBalance } = await useAsyncData('creditBalance', async () => {
  if (!user.value) return 0
  const { data, error } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.value.id)
    .maybeSingle()

  if (error) throw error
  return data?.balance ?? 0
})

const { data: ledger, refresh: refreshLedger } = await useAsyncData('creditLedger', async () => {
  if (!user.value) return []
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('id,delta,reason,external_ref,created_at,metadata')
    .eq('user_id', user.value.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data ?? []) as LedgerRow[]
})

function formatReason(r: string) {
  switch ((r || '').toLowerCase()) {
    case 'subscription_invoice_paid': return 'Membership credits'
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
          <UButton color="neutral" variant="soft" size="sm" @click="refreshAll">
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
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
          <div class="text-sm text-muted">Next: rollover & expiration</div>
          <div class="mt-2 text-sm text-dimmed">
            We’ll implement capped rollover + FIFO expiration next, using this ledger as the source of truth.
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
