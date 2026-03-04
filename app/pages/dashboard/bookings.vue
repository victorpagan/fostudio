<script setup lang="ts">
// auth only — no membership-required middleware. We handle the no-membership
// state inline so users can purchase right from this page.
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin } = useCurrentUser()
const router = useRouter()
const toast = useToast()

type Booking = {
  id: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  credits_burned: number | null
  created_at: string
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

const now = new Date().toISOString()

// Check membership status first (admins always pass)
const { data: membershipData } = await useAsyncData('bookings:membership', async () => {
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

// Only fetch bookings when membership is confirmed
const { data: upcoming, refresh: refreshUpcoming } = await useAsyncData('bookings:upcoming', async () => {
  if (!user.value || !hasMembership.value) return []
  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, notes, credits_burned, created_at')
    .eq('user_id', user.value.sub)
    .gte('start_time', now)
    .in('status', ['confirmed', 'requested'])
    .order('start_time', { ascending: true })
    .limit(20)
  if (error) throw error
  return (data ?? []) as Booking[]
})

const { data: past, refresh: refreshPast } = await useAsyncData('bookings:past', async () => {
  if (!user.value || !hasMembership.value) return []
  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, notes, credits_burned, created_at')
    .eq('user_id', user.value.sub)
    .lt('start_time', now)
    .order('start_time', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []) as Booking[]
})

// Fetch tiers for upsell panel (only loaded when no active membership)
const { data: catalogData } = await useAsyncData('bookings:catalog', async () => {
  if (hasMembership.value) return null
  const res = await $fetch<{ tiers: Tier[] }>('/api/membership/catalog')
  return res?.tiers ?? []
}, { watch: [hasMembership] })

const tiers = computed(() => catalogData.value ?? [])

async function refreshAll() {
  await Promise.all([refreshUpcoming(), refreshPast()])
}

const cancellingId = ref<string | null>(null)

async function cancelBooking(id: string) {
  cancellingId.value = id
  try {
    const result = await $fetch<{
      ok: boolean
      creditsRefunded: number
      eligible_for_refund: boolean
      hours_until_start: number
    }>(`/api/bookings/${id}`, { method: 'DELETE' })

    const msg = result.creditsRefunded > 0
      ? `${result.creditsRefunded} credit${result.creditsRefunded === 1 ? '' : 's'} refunded to your balance.`
      : result.hours_until_start < 24
        ? 'No refund — cancellation within 24h of your session.'
        : 'Booking canceled.'

    toast.add({ title: 'Booking canceled', description: msg, color: 'success' })
    await refreshUpcoming()
  } catch (e: any) {
    toast.add({ title: 'Could not cancel', description: e?.message ?? 'Error', color: 'error' })
  } finally {
    cancellingId.value = null
  }
}

function formatRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  const dateStr = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const startTime = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const endTime = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return { dateStr, timeStr: `${startTime} – ${endTime}` }
}

function durationLabel(start: string, end: string) {
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 3600000
  if (diff === Math.floor(diff)) return `${diff}h`
  const h = Math.floor(diff), m = Math.round((diff - h) * 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function statusColor(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'confirmed': return 'success'
    case 'requested': return 'warning'
    case 'canceled': return 'error'
    default: return 'neutral'
  }
}

function formatStatus(status: string) {
  return status
}

function canCancel(booking: Booking) {
  return booking.status === 'confirmed' && new Date(booking.start_time) > new Date()
}

function isRefundEligible(booking: Booking) {
  return (new Date(booking.start_time).getTime() - Date.now()) / 3600000 > 24
}

function formatMoney(cents: number, currency: string) {
  return currency === 'USD' ? `$${(cents / 100).toFixed(0)}` : `${(cents / 100).toFixed(0)} ${currency}`
}

function cadenceLabel(c: string) {
  if (c === 'monthly') return 'Monthly'
  if (c === 'quarterly') return 'Quarterly'
  return 'Annual'
}

function formatPeakCredits(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function goCheckout(tierId: string, cadence: string) {
  router.push(`/checkout?tier=${encodeURIComponent(tierId)}&cadence=${encodeURIComponent(cadence)}&returnTo=/dashboard/bookings`)
}
</script>

<template>
  <UDashboardPanel id="bookings">
    <template #header>
      <UDashboardNavbar title="My Bookings" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <template v-if="hasMembership">
            <UButton size="sm" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" @click="refreshAll" />
            <UButton size="sm" icon="i-lucide-calendar-plus" to="/dashboard/book">Book studio</UButton>
          </template>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- ── No active membership: show tier upsell ── -->
      <div v-if="!hasMembership" class="p-4 space-y-6">
        <UCard>
          <div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="font-semibold">You don't have an active membership</p>
              <p class="mt-1 text-sm text-dimmed">
                Choose a plan below to unlock studio booking, credits, and priority access.
              </p>
            </div>
            <UBadge color="warning" variant="soft">No active plan</UBadge>
          </div>
        </UCard>

        <div class="grid gap-4 lg:grid-cols-3">
          <UCard v-for="tier in tiers" :key="tier.id">
            <div class="flex items-center gap-2">
              <div class="text-base font-semibold">{{ tier.display_name }}</div>
              <UBadge v-if="tier.adminOnly" color="warning" variant="soft" size="xs" icon="i-lucide-flask-conical">Admin only</UBadge>
            </div>
            <p v-if="tier.description" class="mt-1 text-sm text-dimmed">{{ tier.description }}</p>

            <div class="mt-4 grid grid-cols-3 gap-2">
              <div class="rounded-lg border border-default p-2 text-center">
                <div class="text-sm font-medium">{{ tier.booking_window_days }}d</div>
                <div class="text-xs text-dimmed">booking</div>
              </div>
              <div class="rounded-lg border border-default p-2 text-center">
                <div class="text-sm font-medium">{{ formatPeakCredits(tier.peak_multiplier) }} cr/hr</div>
                <div class="text-xs text-dimmed">peak hour</div>
              </div>
              <div class="rounded-lg border border-default p-2 text-center">
                <div class="text-sm font-medium">{{ tier.max_bank }}</div>
                <div class="text-xs text-dimmed">max credits</div>
              </div>
            </div>

            <div class="mt-4 space-y-2">
              <div
                v-for="opt in tier.membership_plan_variations"
                :key="opt.cadence"
                class="flex items-center justify-between rounded-lg border border-default p-3"
              >
                <div>
                  <div class="text-sm font-medium flex items-center gap-2">
                    {{ cadenceLabel(opt.cadence) }}
                    <UBadge v-if="opt.discount_label" color="neutral" variant="soft" size="xs">
                      {{ opt.discount_label }}
                    </UBadge>
                  </div>
                  <div class="text-xs text-dimmed">{{ opt.credits_per_month }} credits/mo</div>
                </div>
                <div class="text-right">
                  <div class="text-sm font-semibold">{{ formatMoney(opt.price_cents, opt.currency) }}</div>
                  <div class="text-xs text-dimmed">/ {{ opt.cadence === 'monthly' ? 'mo' : opt.cadence === 'quarterly' ? 'qtr' : 'yr' }}</div>
                </div>
              </div>
            </div>

            <div class="mt-4 grid gap-2">
              <UButton
                v-for="opt in tier.membership_plan_variations"
                :key="opt.cadence + '-cta'"
                block
                size="sm"
                @click="goCheckout(tier.id, opt.cadence)"
              >
                Start {{ tier.display_name }} · {{ cadenceLabel(opt.cadence) }}
              </UButton>
            </div>
          </UCard>
        </div>
      </div>

      <!-- ── Active membership: show bookings ── -->
      <div v-else class="p-4 space-y-6">
        <!-- Upcoming -->
        <div>
          <h2 class="text-sm font-semibold text-muted mb-3 flex items-center gap-2">
            <UIcon name="i-lucide-calendar-clock" class="size-4" />
            Upcoming
          </h2>

          <div v-if="!upcoming?.length" class="rounded-lg border border-default p-6 text-center">
            <UIcon name="i-lucide-calendar-x" class="size-8 text-dimmed mx-auto mb-2" />
            <p class="text-sm text-dimmed">No upcoming bookings.</p>
            <UButton class="mt-3" size="sm" to="/dashboard/book">Book studio time</UButton>
          </div>

          <div v-else class="space-y-2">
            <UCard v-for="booking in upcoming" :key="booking.id" :ui="{ body: 'p-4 sm:p-4' }">
              <div class="flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <UBadge :color="statusColor(booking.status)" variant="soft" size="sm">{{ formatStatus(booking.status) }}</UBadge>
                    <span class="text-sm font-medium">{{ formatRange(booking.start_time, booking.end_time).dateStr }}</span>
                  </div>
                  <p class="mt-1 text-sm text-dimmed">
                    {{ formatRange(booking.start_time, booking.end_time).timeStr }}
                    · {{ durationLabel(booking.start_time, booking.end_time) }}
                    <span v-if="booking.credits_burned"> · {{ booking.credits_burned }} credits</span>
                  </p>
                  <p v-if="booking.notes" class="mt-1.5 text-xs text-dimmed italic truncate max-w-sm">{{ booking.notes }}</p>
                </div>
                <div class="shrink-0">
                  <UTooltip
                    v-if="canCancel(booking)"
                    :text="isRefundEligible(booking) ? 'Cancel · credit refund eligible' : 'Cancel · no refund (< 24h)'"
                  >
                    <UButton
                      size="sm"
                      color="error"
                      variant="soft"
                      :loading="cancellingId === booking.id"
                      @click="cancelBooking(booking.id)"
                    >
                      Cancel
                    </UButton>
                  </UTooltip>
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Past -->
        <div>
          <h2 class="text-sm font-semibold text-muted mb-3 flex items-center gap-2">
            <UIcon name="i-lucide-history" class="size-4" />
            Past bookings
          </h2>

          <div v-if="!past?.length" class="rounded-lg border border-default p-6 text-center">
            <p class="text-sm text-dimmed">No booking history yet.</p>
          </div>

          <div v-else class="space-y-2">
            <UCard v-for="booking in past" :key="booking.id" :ui="{ body: 'p-4 sm:p-4' }">
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <UBadge :color="statusColor(booking.status)" variant="soft" size="sm">{{ formatStatus(booking.status) }}</UBadge>
                    <span class="text-sm font-medium">{{ formatRange(booking.start_time, booking.end_time).dateStr }}</span>
                  </div>
                  <p class="mt-1 text-sm text-dimmed">
                    {{ formatRange(booking.start_time, booking.end_time).timeStr }}
                    · {{ durationLabel(booking.start_time, booking.end_time) }}
                    <span v-if="booking.credits_burned"> · {{ booking.credits_burned }} credits</span>
                  </p>
                  <p v-if="booking.notes" class="mt-1.5 text-xs text-dimmed italic truncate max-w-sm">{{ booking.notes }}</p>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
