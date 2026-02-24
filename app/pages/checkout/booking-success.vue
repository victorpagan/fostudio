<script setup lang="ts">
/**
 * /checkout/booking-success
 *
 * Landing page after a guest completes payment via Square checkout.
 * Square redirects here with ?booking_id=<uuid>.
 *
 * Polls the booking status until it flips from 'pending_payment' → 'confirmed'
 * (the Square webhook does this flip), then shows confirmation details.
 *
 * No auth required — this is a public page reachable by guests.
 */
definePageMeta({
  // Explicitly no auth middleware — guests land here after Square checkout
})

const supabase = useSupabaseClient()
const route = useRoute()

const bookingId = computed(() => route.query.booking_id as string | undefined)

type BookingRow = {
  id: string
  start_time: string
  end_time: string
  status: string
  guest_name: string | null
  guest_email: string | null
  credits_burned: number | null
  notes: string | null
}

const booking = ref<BookingRow | null>(null)
const status = ref<'loading' | 'pending' | 'confirmed' | 'error'>('loading')
const tries = ref(0)
const MAX_TRIES = 15 // 30 seconds total

async function fetchBooking() {
  if (!bookingId.value) {
    status.value = 'error'
    return
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, guest_name, guest_email, credits_burned, notes')
    .eq('id', bookingId.value)
    .maybeSingle()

  if (error || !data) {
    status.value = 'error'
    return
  }

  booking.value = data as BookingRow

  if (data.status === 'confirmed') {
    status.value = 'confirmed'
  } else if (data.status === 'pending_payment') {
    status.value = 'pending'
  } else {
    status.value = 'error'
  }
}

onMounted(async () => {
  if (!bookingId.value) {
    status.value = 'error'
    return
  }

  await fetchBooking()

  if (status.value === 'confirmed') return

  // Poll every 2 seconds until confirmed or max tries
  const timer = setInterval(async () => {
    tries.value++
    await fetchBooking()

    if (status.value === 'confirmed' || tries.value >= MAX_TRIES) {
      clearInterval(timer)
    }
  }, 2000)
})

// Formatting helpers
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'America/Los_Angeles'
  })
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mx-auto max-w-2xl space-y-6">

      <!-- Loading -->
      <div v-if="status === 'loading'" class="text-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin size-8 text-primary mx-auto" />
        <p class="mt-3 text-sm text-muted">Looking up your booking…</p>
      </div>

      <!-- Confirmed -->
      <template v-else-if="status === 'confirmed' && booking">
        <div class="text-center space-y-2">
          <div class="mx-auto size-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <UIcon name="i-heroicons-check-circle-solid" class="size-8 text-green-600 dark:text-green-400" />
          </div>
          <h1 class="text-3xl font-semibold tracking-tight">Booking Confirmed!</h1>
          <p class="text-muted">
            Your payment was received and your studio time is reserved.
          </p>
        </div>

        <UCard>
          <div class="space-y-4">
            <div v-if="booking.guest_name" class="flex justify-between text-sm">
              <span class="text-muted">Name</span>
              <span class="font-medium">{{ booking.guest_name }}</span>
            </div>

            <div class="flex justify-between text-sm">
              <span class="text-muted">Date</span>
              <span class="font-medium">{{ formatDate(booking.start_time) }}</span>
            </div>

            <div class="flex justify-between text-sm">
              <span class="text-muted">Time</span>
              <span class="font-medium">
                {{ formatTime(booking.start_time) }} – {{ formatTime(booking.end_time) }}
              </span>
            </div>

            <div v-if="booking.notes" class="flex justify-between text-sm">
              <span class="text-muted">Notes</span>
              <span class="font-medium text-right max-w-xs">{{ booking.notes }}</span>
            </div>

            <UDivider />

            <div class="flex justify-between text-sm">
              <span class="text-muted">Booking ID</span>
              <code class="text-xs text-dimmed font-mono">{{ booking.id }}</code>
            </div>
          </div>
        </UCard>

        <UCard>
          <p class="text-sm text-muted">
            A confirmation email will be sent to
            <strong>{{ booking.guest_email }}</strong>.
          </p>
          <p class="mt-2 text-xs text-dimmed">
            If you need to make changes, please contact us with your booking ID above.
          </p>
        </UCard>

        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <UButton to="/calendar" size="lg">View Calendar</UButton>
          <UButton to="/" color="neutral" variant="soft" size="lg">Back to Home</UButton>
        </div>
      </template>

      <!-- Still pending (waiting for webhook) -->
      <template v-else-if="status === 'pending'">
        <div class="text-center space-y-2">
          <div class="mx-auto size-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <UIcon name="i-heroicons-clock" class="size-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 class="text-3xl font-semibold tracking-tight">Payment Processing</h1>
          <p class="text-muted">
            Your payment was received — your booking is being confirmed.
          </p>
        </div>

        <UCard>
          <div class="flex items-center gap-3">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin size-5 text-primary shrink-0" />
            <div>
              <div class="text-sm font-medium">Waiting for confirmation…</div>
              <div class="mt-0.5 text-xs text-dimmed">
                This usually takes a few seconds. Checked {{ tries }} of {{ MAX_TRIES }} times.
              </div>
            </div>
          </div>

          <p class="mt-4 text-xs text-dimmed">
            If this page doesn't update within a minute, your booking is still being processed.
            You'll receive a confirmation email once it's complete. Booking ID:
            <code class="font-mono">{{ bookingId }}</code>
          </p>
        </UCard>

        <div class="flex gap-3 justify-center">
          <UButton to="/calendar" color="neutral" variant="soft">View Calendar</UButton>
          <UButton to="/" color="neutral" variant="ghost">Back to Home</UButton>
        </div>
      </template>

      <!-- Error -->
      <template v-else>
        <div class="text-center space-y-2">
          <div class="mx-auto size-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <UIcon name="i-heroicons-exclamation-triangle" class="size-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 class="text-3xl font-semibold tracking-tight">Booking Not Found</h1>
          <p class="text-muted">
            We couldn't locate your booking. If you completed payment, please contact us.
          </p>
        </div>

        <UCard>
          <p class="text-sm text-dimmed">
            Booking reference:
            <code class="font-mono text-xs">{{ bookingId ?? 'none' }}</code>
          </p>
          <p class="mt-2 text-xs text-dimmed">
            Please save this ID and reach out if you need assistance.
          </p>
        </UCard>

        <div class="flex gap-3 justify-center">
          <UButton to="/book" color="neutral" variant="soft">Try Again</UButton>
          <UButton to="/" color="neutral" variant="ghost">Back to Home</UButton>
        </div>
      </template>

    </div>
  </UContainer>
</template>
