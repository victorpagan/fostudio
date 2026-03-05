<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type AdminBooking = {
  id: string
  user_id: string | null
  customer_id: string | null
  start_time: string
  end_time: string
  status: string
  credits_burned: number | null
  guest_name: string | null
  guest_email: string | null
  notes: string | null
  created_at: string
  updated_at: string
  member_name: string | null
  member_email: string | null
  is_guest: boolean
}

const toast = useToast()
const statusFilter = ref<string>('all')
const refundCredits = ref(true)
const cancelingId = ref<string | null>(null)

const { data: bookingRows, refresh, pending } = await useAsyncData('admin:bookings', async () => {
  const query = statusFilter.value === 'all'
    ? {}
    : { status: statusFilter.value }
  const res = await $fetch<{ bookings: AdminBooking[] }>('/api/admin/bookings', { query })
  return res.bookings
}, { watch: [statusFilter] })

const bookings = computed(() => bookingRows.value ?? [])

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function bookingLabel(booking: AdminBooking) {
  if (booking.is_guest) return booking.guest_name || booking.guest_email || 'Guest booking'
  return booking.member_name || booking.member_email || booking.user_id || 'Member booking'
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

async function cancelBooking(bookingId: string) {
  cancelingId.value = bookingId
  try {
    const res = await $fetch<{ refundedCredits: number }>('/api/admin/bookings/cancel', {
      method: 'POST',
      body: {
        bookingId,
        refundCredits: refundCredits.value
      }
    })

    const description = res.refundedCredits > 0
      ? `${res.refundedCredits} credits refunded.`
      : 'Booking canceled.'

    toast.add({
      title: 'Booking canceled',
      description
    })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not cancel booking',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    cancelingId.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="admin-bookings">
    <template #header>
      <UDashboardNavbar title="Calendar & Booking Tools" :ui="{ right: 'gap-2' }">
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
          icon="i-lucide-calendar-range"
          title="Booking operations"
          description="Review all member and guest bookings. Use admin cancel when a schedule needs manual intervention."
        />

        <UCard>
          <div class="flex flex-wrap items-center gap-3">
            <UFormField label="Status filter">
              <USelect
                v-model="statusFilter"
                :items="[
                  { label: 'All', value: 'all' },
                  { label: 'Confirmed', value: 'confirmed' },
                  { label: 'Requested', value: 'requested' },
                  { label: 'Canceled', value: 'canceled' }
                ]"
              />
            </UFormField>
            <UCheckbox v-model="refundCredits" label="Refund credits on cancel" />
          </div>
        </UCard>

        <div class="space-y-3">
          <UCard
            v-for="booking in bookings"
            :key="booking.id"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <div class="font-medium truncate">
                    {{ bookingLabel(booking) }}
                  </div>
                  <UBadge :color="booking.status === 'confirmed' ? 'success' : booking.status === 'requested' ? 'warning' : 'neutral'" size="xs" variant="soft">
                    {{ booking.status }}
                  </UBadge>
                  <UBadge :color="booking.is_guest ? 'neutral' : 'primary'" size="xs" variant="soft">
                    {{ booking.is_guest ? 'guest' : 'member' }}
                  </UBadge>
                </div>
                <div class="mt-1 text-sm text-dimmed">
                  {{ formatDate(booking.start_time) }} → {{ formatDate(booking.end_time) }}
                </div>
                <div class="mt-1 text-xs text-dimmed">
                  Credits burned: {{ booking.credits_burned ?? 0 }} · Created {{ formatDate(booking.created_at) }}
                </div>
                <div v-if="booking.notes" class="mt-2 text-xs text-dimmed">
                  {{ booking.notes }}
                </div>
              </div>

              <UButton
                color="error"
                variant="soft"
                size="sm"
                :loading="cancelingId === booking.id"
                :disabled="booking.status === 'canceled'"
                @click="cancelBooking(booking.id)"
              >
                Cancel booking
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
