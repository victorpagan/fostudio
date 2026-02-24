<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'membership-required'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
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

const now = new Date().toISOString()

const { data: upcoming, refresh: refreshUpcoming } = await useAsyncData('bookings:upcoming', async () => {
  if (!user.value) return []
  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, notes, credits_burned, created_at')
    .eq('user_id', user.value.id)
    .gte('start_time', now)
    .in('status', ['confirmed', 'requested'])
    .order('start_time', { ascending: true })
    .limit(20)
  if (error) throw error
  return (data ?? []) as Booking[]
})

const { data: past, refresh: refreshPast } = await useAsyncData('bookings:past', async () => {
  if (!user.value) return []
  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, notes, credits_burned, created_at')
    .eq('user_id', user.value.id)
    .lt('start_time', now)
    .order('start_time', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []) as Booking[]
})

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
        : 'Booking cancelled.'

    toast.add({ title: 'Booking cancelled', description: msg, color: 'success' })
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
    case 'cancelled': case 'canceled': return 'error'
    default: return 'neutral'
  }
}

function canCancel(booking: Booking) {
  return booking.status === 'confirmed' && new Date(booking.start_time) > new Date()
}

function isRefundEligible(booking: Booking) {
  return (new Date(booking.start_time).getTime() - Date.now()) / 3600000 > 24
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
          <UButton size="sm" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" @click="refreshAll" />
          <UButton size="sm" icon="i-lucide-calendar-plus" to="/dashboard/book">Book studio</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-6">
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
                    <UBadge :color="statusColor(booking.status)" variant="soft" size="sm">{{ booking.status }}</UBadge>
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
                    <UBadge :color="statusColor(booking.status)" variant="soft" size="sm">{{ booking.status }}</UBadge>
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
