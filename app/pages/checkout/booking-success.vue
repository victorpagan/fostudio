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
 * Auth is optional for webhook-backed confirmations; authenticated guest redirects
 * also try to claim the Square payment immediately.
 */
definePageMeta({
  // Explicitly no auth middleware — guests land here after Square checkout
})

useNoindexSeo({
  title: 'FO Studio booking confirmation',
  description: 'Confirm the status of a completed non-member studio booking payment.',
  canonicalPath: '/checkout/booking-success'
})

const supabase = useSupabaseClient()
const route = useRoute()
const user = useSupabaseUser()

const bookingId = computed(() => route.query.booking_id as string | undefined)
const guestPaymentToken = computed(() => route.query.guest_payment as string | undefined)
const orderId = computed(() =>
  (route.query.orderId as string | undefined)
  ?? (route.query.order_id as string | undefined)
)

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
const status = ref<'loading' | 'pending' | 'confirmed' | 'expired' | 'error'>('loading')
const tries = ref(0)
const MAX_TRIES = 15 // 30 seconds total
const pollingComplete = ref(false)
const checkingAgain = ref(false)
const claimMessage = ref<string | null>(null)
const claimError = ref<string | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

function apiErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const source = error as { data?: { statusMessage?: string, message?: string }, message?: string }
  return source.data?.statusMessage ?? source.data?.message ?? source.message ?? null
}

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
  } else if (['canceled', 'cancelled'].includes(String(data.status ?? '').toLowerCase())) {
    status.value = 'expired'
  } else {
    status.value = 'error'
  }
}

async function claimGuestPaymentIfPossible() {
  if (!user.value || !guestPaymentToken.value) return
  try {
    claimError.value = null
    const response = await $fetch<{ ok?: boolean, status?: string, message?: string }>('/api/bookings/guest/claim', {
      method: 'POST',
      body: {
        token: guestPaymentToken.value,
        orderId: orderId.value
      }
    })
    claimMessage.value = response.message ?? null
  } catch (error) {
    claimError.value = apiErrorMessage(error) ?? 'We could not verify the payment yet.'
    console.warn('[booking-success] guest payment claim failed or is still pending', error)
  }
}

async function checkAgain() {
  checkingAgain.value = true
  pollingComplete.value = false
  claimError.value = null
  try {
    await claimGuestPaymentIfPossible()
    await fetchBooking()
  } finally {
    checkingAgain.value = false
  }
}

onMounted(async () => {
  if (!bookingId.value) {
    status.value = 'error'
    return
  }

  await claimGuestPaymentIfPossible()
  await fetchBooking()

  if (status.value === 'confirmed') return

  // Poll every 2 seconds until confirmed or max tries
  pollTimer = setInterval(async () => {
    tries.value++
    await claimGuestPaymentIfPossible()
    await fetchBooking()

    if (status.value === 'confirmed' || tries.value >= MAX_TRIES) {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      pollingComplete.value = status.value !== 'confirmed'
    }
  }, 2000)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
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
      <div
        v-if="status === 'loading'"
        class="text-center py-12"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin size-8 text-primary mx-auto"
        />
        <p class="mt-3 text-sm text-muted">
          Looking up your booking…
        </p>
      </div>

      <!-- Confirmed -->
      <template v-else-if="status === 'confirmed' && booking">
        <div class="text-center space-y-2">
          <div class="mx-auto size-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <UIcon
              name="i-lucide-circle-check-big"
              class="size-8 text-green-600 dark:text-green-400"
            />
          </div>
          <h1 class="text-3xl font-semibold tracking-tight">
            Booking Confirmed!
          </h1>
          <p class="text-muted">
            Your payment was received and your studio time is reserved.
          </p>
        </div>

        <UCard>
          <div class="space-y-4">
            <div
              v-if="booking.guest_name"
              class="flex justify-between text-sm"
            >
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

            <div
              v-if="booking.notes"
              class="flex justify-between text-sm"
            >
              <span class="text-muted">Notes</span>
              <span class="font-medium text-right max-w-xs">{{ booking.notes }}</span>
            </div>

            <USeparator />

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
          <UButton
            to="/calendar"
            size="lg"
          >
            View Calendar
          </UButton>
          <UButton
            to="/"
            color="neutral"
            variant="soft"
            size="lg"
          >
            Back to Home
          </UButton>
        </div>
      </template>

      <!-- Still pending (waiting for webhook) -->
      <template v-else-if="status === 'pending'">
        <div class="text-center space-y-2">
          <div class="mx-auto size-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <UIcon
              name="i-lucide-clock"
              class="size-8 text-amber-600 dark:text-amber-400"
            />
          </div>
          <h1 class="text-3xl font-semibold tracking-tight">
            Checking Payment
          </h1>
          <p class="text-muted">
            Your booking is not confirmed until payment verification finishes.
          </p>
        </div>

        <UCard>
          <div class="flex items-center gap-3">
            <UIcon
              :name="pollingComplete ? 'i-lucide-circle-help' : 'i-lucide-loader-circle'"
              :class="['size-5 text-primary shrink-0', { 'animate-spin': !pollingComplete }]"
            />
            <div>
              <div class="text-sm font-medium">
                {{ pollingComplete ? 'Still awaiting confirmation' : 'Checking Square and your booking…' }}
              </div>
              <div class="mt-0.5 text-xs text-dimmed">
                {{ pollingComplete ? 'Use Check again before starting another checkout.' : `Checked ${tries} of ${MAX_TRIES} times.` }}
              </div>
            </div>
          </div>

          <AppAlert
            v-if="claimError"
            class="mt-4"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            title="Payment verification needs attention"
            :description="claimError"
          />
          <AppAlert
            v-else-if="claimMessage"
            class="mt-4"
            color="info"
            variant="soft"
            icon="i-lucide-info"
            :description="claimMessage"
          />

          <p class="mt-4 text-xs text-dimmed">
            Do not assume the studio time is booked until this page says Confirmed or you receive the confirmation email. Booking ID:
            <code class="font-mono">{{ bookingId }}</code>
          </p>
        </UCard>

        <div class="flex gap-3 justify-center">
          <UButton
            v-if="pollingComplete"
            :loading="checkingAgain"
            @click="checkAgain"
          >
            Check again
          </UButton>
          <UButton
            to="/dashboard/book"
            color="neutral"
            variant="soft"
          >
            Return to booking
          </UButton>
          <UButton
            to="/"
            color="neutral"
            variant="ghost"
          >
            Back to Home
          </UButton>
        </div>
      </template>

      <template v-else-if="status === 'expired'">
        <div class="text-center space-y-2">
          <div class="mx-auto size-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <UIcon
              name="i-lucide-timer-off"
              class="size-8 text-amber-600 dark:text-amber-400"
            />
          </div>
          <h1 class="text-3xl font-semibold tracking-tight">
            Reservation Expired
          </h1>
          <p class="text-muted">
            Payment was not confirmed within the reservation window, so the studio time was released.
          </p>
        </div>

        <AppAlert
          color="warning"
          variant="soft"
          icon="i-lucide-credit-card"
          title="Start a fresh checkout"
          description="Return to booking and choose the time again. If your card was declined, verify the CVV and billing ZIP or use another card."
        />

        <div class="flex gap-3 justify-center">
          <UButton to="/dashboard/book">
            Book again
          </UButton>
          <UButton
            to="/dashboard/bookings"
            color="neutral"
            variant="soft"
          >
            My bookings
          </UButton>
        </div>
      </template>

      <!-- Error -->
      <template v-else>
        <div class="text-center space-y-2">
          <div class="mx-auto size-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <UIcon
              name="i-lucide-triangle-alert"
              class="size-8 text-red-600 dark:text-red-400"
            />
          </div>
          <h1 class="text-3xl font-semibold tracking-tight">
            Booking Could Not Be Verified
          </h1>
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
          <UButton
            to="/dashboard/book"
            color="neutral"
            variant="soft"
          >
            Try Again
          </UButton>
          <UButton
            to="/"
            color="neutral"
            variant="ghost"
          >
            Back to Home
          </UButton>
        </div>
      </template>
    </div>
  </UContainer>
</template>
