<script setup lang="ts">
/**
 * /book — Public booking entry point.
 *
 * - Authenticated members with active membership → redirect to /dashboard/book
 * - Authenticated users without active membership → guest flow + member upsell
 * - Anonymous / guest → guest booking flow (pay-as-you-go via Square)
 *
 * No middleware: handles the branching here so anonymous users can land freely.
 */

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const router = useRouter()
const toast = useToast()

type GuestPreview = {
  durationHours: number
  totalCents: number
  creditsNeeded: number
  peakMultiplier: number
  breakdown?: {
    isPeakWindow?: boolean
  }
}

type GuestCheckoutResponse = {
  checkoutUrl?: string
}

type RequestError = {
  data?: {
    statusMessage?: string
  }
  message?: string
}

const membershipStatus = ref<string | null>(null)
const checking = ref(true)

onMounted(async () => {
  if (!user.value) {
    checking.value = false
    return
  }
  const { data } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.value.sub)
    .maybeSingle()

  membershipStatus.value = data?.status ?? null
  checking.value = false

  if (membershipStatus.value === 'active') {
    router.replace('/dashboard/book')
  }
})

// Guest booking form state
const guestForm = reactive({ guest_name: '', guest_email: '', notes: '' })
const selectedSlot = ref<{ start: Date, end: Date } | null>(null)
const guestModalOpen = ref(false)
const guestPreview = ref<GuestPreview | null>(null)
const guestPreviewLoading = ref(false)
const guestSubmitting = ref(false)
const guestPreviewError = ref<string | null>(null)

async function onSelect(payload: { start: Date, end: Date }) {
  selectedSlot.value = payload
  guestModalOpen.value = true
  guestPreview.value = null
  guestPreviewError.value = null
  guestPreviewLoading.value = true
  try {
    guestPreview.value = await $fetch('/api/bookings/preview', {
      query: { start: payload.start.toISOString(), end: payload.end.toISOString(), mode: 'guest' }
    })
  } catch (error: unknown) {
    const e = error as RequestError
    guestPreviewError.value = e.data?.statusMessage ?? 'Could not calculate cost'
  } finally {
    guestPreviewLoading.value = false
  }
}

async function submitGuestBooking() {
  if (!selectedSlot.value) return
  guestSubmitting.value = true
  try {
    const res = await $fetch('/api/bookings/guest', {
      method: 'POST',
      body: {
        start_time: selectedSlot.value.start.toISOString(),
        end_time: selectedSlot.value.end.toISOString(),
        guest_name: guestForm.guest_name,
        guest_email: guestForm.guest_email,
        notes: guestForm.notes || null
      }
    }) as GuestCheckoutResponse
    if (res.checkoutUrl) window.location.href = res.checkoutUrl
  } catch (error: unknown) {
    const e = error as RequestError
    toast.add({ title: 'Could not book', description: e.data?.statusMessage ?? e.message ?? 'Booking failed', color: 'error' })
    guestSubmitting.value = false
  }
}

function formatDateTime(d: Date) {
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}
function formatDuration(hours: number) {
  if (!hours) return ''
  if (hours === Math.floor(hours)) return `${hours}h`
  const h = Math.floor(hours), m = Math.round((hours - h) * 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function formatPrice(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function formatPeakCredits(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}
</script>

<template>
  <div>
    <UContainer class="py-10 sm:py-14">
      <div
        v-if="checking || (user && membershipStatus === 'active')"
        class="flex items-center justify-center py-20"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-8 animate-spin text-dimmed"
        />
      </div>

      <template v-else>
        <div class="space-y-6">
          <section class="studio-grid overflow-hidden rounded-[2rem] px-5 py-6 sm:px-8 sm:py-8">
            <div class="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(17rem,0.8fr)]">
              <div class="space-y-5">
                <span class="studio-kicker">Guest booking</span>
                <div class="max-w-3xl space-y-4">
                  <h1 class="studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-7xl">
                    Book a one-off studio day without committing first.
                  </h1>
                  <p class="max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
                    Use the public calendar to find an open slot, price it instantly, and check out securely through Square.
                    If your shoots start repeating, move to a membership for better booking range, monthly credits, and included equipment plus consumables.
                  </p>
                </div>
              </div>

              <div class="space-y-4">
                <div class="studio-panel p-5">
                  <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
                    Good to know
                  </div>
                  <div class="mt-4 space-y-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
                    <p>Guest bookings are best for single production days, client tests, or trying the room before joining.</p>
                    <p>Open slots are available up to 7 days ahead and require payment to lock in the session.</p>
                    <p>Members get a longer planning window, steadier costs, and included gear plus consumables like backdrop paper.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div class="max-w-2xl">
              <h2 class="studio-display text-4xl text-[color:var(--gruv-ink-0)] sm:text-5xl">
                Pick a time that works
              </h2>
              <p class="mt-3 text-sm leading-7 text-[color:var(--gruv-ink-2)] sm:text-base">
                Booked blocks and hold windows are already accounted for below, so any open slot you select is available to price and reserve.
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="!user"
                color="neutral"
                variant="soft"
                to="/login"
                size="sm"
              >
                Sign in
              </UButton>
              <UButton
                to="/memberships"
                size="sm"
              >
                Become a member
              </UButton>
            </div>
          </div>

          <div
            v-if="user && membershipStatus !== 'active'"
            class="studio-panel p-5"
          >
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
                  Members get the smoother path
                </div>
                <p class="mt-2 max-w-2xl text-sm leading-7 text-[color:var(--gruv-ink-2)]">
                  Membership gives you monthly credits, a longer booking window, and included equipment/backdrop consumables for repeat shoots.
                </p>
              </div>
              <UButton to="/memberships">
                View memberships
              </UButton>
            </div>
          </div>

          <AvailabilityCalendar
            endpoint="/api/calendar/public"
            @select="onSelect"
          />

          <p class="text-center text-xs leading-6 text-[color:var(--gruv-ink-2)]">
            Blocked times are already booked. Select any open slot to continue.
            Guest bookings are limited to 7 days ahead and require payment to confirm.
          </p>
        </div>
      </template>
    </UContainer>

    <UModal
      v-model:open="guestModalOpen"
      :dismissible="!guestSubmitting"
    >
      <template #content>
        <UCard
          class="studio-panel flex max-h-[calc(100dvh-2rem)] flex-col sm:max-h-[calc(100dvh-4rem)]"
          :ui="{ body: 'min-h-0 overflow-y-scroll' }"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <h3 class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
                  Complete your booking
                </h3>
                <p class="mt-1 text-sm text-[color:var(--gruv-ink-2)]">
                  Review the time, confirm the price, then head to Square for payment.
                </p>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="guestSubmitting"
                @click="guestModalOpen = false"
              />
            </div>
          </template>

          <div class="space-y-4 pr-1">
            <!-- Time -->
            <div
              v-if="selectedSlot"
              class="rounded-2xl bg-[rgba(181,118,20,0.08)] p-4 space-y-1.5 text-sm"
            >
              <div class="flex justify-between">
                <span class="text-dimmed">Start</span><span class="font-medium">{{ formatDateTime(selectedSlot.start) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-dimmed">End</span><span class="font-medium">{{ formatDateTime(selectedSlot.end) }}</span>
              </div>
            </div>

            <!-- Pricing -->
            <div class="rounded-2xl bg-[color:var(--gruv-bg-1)]/75 p-4 space-y-2">
              <div class="text-sm font-medium text-[color:var(--gruv-ink-0)]">
                Pricing
              </div>
              <div
                v-if="guestPreviewLoading"
                class="flex items-center gap-2 text-sm text-dimmed"
              >
                <UIcon
                  name="i-lucide-loader-circle"
                  class="size-4 animate-spin"
                /> Calculating…
              </div>
              <div
                v-else-if="guestPreviewError"
                class="text-sm text-red-500"
              >
                {{ guestPreviewError }}
              </div>
              <div
                v-else-if="guestPreview"
                class="space-y-1 text-sm"
              >
                <div class="flex justify-between">
                  <span class="text-dimmed">Duration</span><span>{{ formatDuration(guestPreview.durationHours) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-dimmed">Rate</span>
                  <UBadge
                    :color="guestPreview.breakdown?.isPeakWindow ? 'warning' : 'success'"
                    variant="soft"
                    size="sm"
                  >
                    {{ guestPreview.breakdown?.isPeakWindow ? `Peak (${formatPeakCredits(guestPreview.peakMultiplier)} credits/hr)` : 'Off-peak (1 credit/hr)' }}
                  </UBadge>
                </div>
                <div class="flex justify-between items-center border-t border-default pt-2 mt-1">
                  <span class="font-medium">Total</span>
                  <span class="text-lg font-semibold">{{ guestPreview.totalCents ? formatPrice(guestPreview.totalCents) : `${guestPreview.creditsNeeded} cr` }}</span>
                </div>
                <p class="text-xs text-dimmed">
                  Payment is processed securely via Square. Your booking locks in as soon as payment clears.
                </p>
              </div>
            </div>

            <!-- Guest details -->
            <div class="space-y-3">
              <UFormField
                label="Your name"
                required
              >
                <UInput
                  v-model="guestForm.guest_name"
                  placeholder="Jane Smith"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Email"
                required
              >
                <UInput
                  v-model="guestForm.guest_email"
                  type="email"
                  placeholder="jane@example.com"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Notes"
                hint="Optional"
              >
                <UTextarea
                  v-model="guestForm.notes"
                  placeholder="Setup requirements, shoot type, etc."
                  :rows="2"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="guestSubmitting"
                @click="guestModalOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                :loading="guestSubmitting"
                :disabled="guestPreviewLoading || !!guestPreviewError || !guestPreview || !guestForm.guest_name || !guestForm.guest_email"
                @click="submitGuestBooking"
              >
                Pay &amp; confirm{{ guestPreview?.totalCents ? ` · ${formatPrice(guestPreview.totalCents)}` : '' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
