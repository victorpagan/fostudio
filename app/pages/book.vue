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
const selectedSlot = ref<{ start: Date; end: Date } | null>(null)
const guestModalOpen = ref(false)
const guestPreview = ref<any>(null)
const guestPreviewLoading = ref(false)
const guestSubmitting = ref(false)
const guestPreviewError = ref<string | null>(null)

async function onSelect(payload: { start: Date; end: Date }) {
  selectedSlot.value = payload
  guestModalOpen.value = true
  guestPreview.value = null
  guestPreviewError.value = null
  guestPreviewLoading.value = true
  try {
    guestPreview.value = await $fetch('/api/bookings/preview', {
      query: { start: payload.start.toISOString(), end: payload.end.toISOString(), mode: 'guest' }
    })
  } catch (e: any) {
    guestPreviewError.value = e?.data?.statusMessage ?? 'Could not calculate cost'
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
    }) as any
    if (res.checkoutUrl) window.location.href = res.checkoutUrl
  } catch (e: any) {
    toast.add({ title: 'Could not book', description: e?.data?.statusMessage ?? e?.message ?? 'Booking failed', color: 'error' })
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
</script>

<template>
  <UContainer class="py-10">
    <div v-if="checking || (user && membershipStatus === 'active')" class="flex items-center justify-center py-20">
      <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-dimmed" />
    </div>

    <template v-else>
      <div class="max-w-4xl">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 class="text-3xl font-semibold tracking-tight">Book the studio</h1>
            <p class="mt-2 text-dimmed">
              Select a time slot below. Guest bookings are charged at a pay-as-you-go rate.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UButton v-if="!user" color="neutral" variant="soft" to="/login" size="sm">Sign in</UButton>
            <UButton to="/memberships" size="sm">Become a member</UButton>
          </div>
        </div>

        <UAlert
          v-if="user && membershipStatus !== 'active'"
          class="mt-4"
          color="primary"
          variant="soft"
          title="Members get better rates"
          description="A membership gives you pre-purchased credits at a lower per-hour rate, priority booking windows, and equipment holds."
          :actions="[{ label: 'View membership plans', to: '/memberships' }]"
        />

        <UCard class="mt-6" :ui="{ body: 'p-0 sm:p-0' }">
          <AvailabilityCalendar endpoint="/api/calendar/public" @select="onSelect" />
        </UCard>

        <p class="mt-3 text-xs text-dimmed text-center">
          Blocked times are already booked. Select any open slot to continue.
          Guest bookings are limited to 7 days ahead and require payment to confirm.
        </p>
      </div>
    </template>
  </UContainer>

  <!-- Guest booking modal -->
  <UModal v-model:open="guestModalOpen" :dismissible="!guestSubmitting">
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-base">Complete your booking</h3>
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :disabled="guestSubmitting" @click="guestModalOpen = false" />
          </div>
        </template>

        <div class="space-y-4">
          <!-- Time -->
          <div v-if="selectedSlot" class="rounded-lg bg-elevated p-3 space-y-1.5 text-sm">
            <div class="flex justify-between"><span class="text-dimmed">Start</span><span class="font-medium">{{ formatDateTime(selectedSlot.start) }}</span></div>
            <div class="flex justify-between"><span class="text-dimmed">End</span><span class="font-medium">{{ formatDateTime(selectedSlot.end) }}</span></div>
          </div>

          <!-- Pricing -->
          <div class="rounded-lg border border-default p-3 space-y-2">
            <div class="text-sm font-medium">Pricing</div>
            <div v-if="guestPreviewLoading" class="flex items-center gap-2 text-sm text-dimmed">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Calculating…
            </div>
            <div v-else-if="guestPreviewError" class="text-sm text-red-500">{{ guestPreviewError }}</div>
            <div v-else-if="guestPreview" class="space-y-1 text-sm">
              <div class="flex justify-between"><span class="text-dimmed">Duration</span><span>{{ formatDuration(guestPreview.durationHours) }}</span></div>
              <div class="flex justify-between">
                <span class="text-dimmed">Rate</span>
                <UBadge :color="guestPreview.breakdown?.isPeakWindow ? 'warning' : 'success'" variant="soft" size="sm">
                  {{ guestPreview.breakdown?.isPeakWindow ? `Peak (${guestPreview.peakMultiplier}×)` : 'Off-peak' }}
                </UBadge>
              </div>
              <div class="flex justify-between items-center border-t border-default pt-2 mt-1">
                <span class="font-medium">Total</span>
                <span class="text-lg font-semibold">{{ guestPreview.totalCents ? formatPrice(guestPreview.totalCents) : `${guestPreview.creditsNeeded} cr` }}</span>
              </div>
              <p class="text-xs text-dimmed">Payment processed securely via Square. Booking confirmed immediately on payment.</p>
            </div>
          </div>

          <!-- Guest details -->
          <div class="space-y-3">
            <UFormField label="Your name" required>
              <UInput v-model="guestForm.guest_name" placeholder="Jane Smith" class="w-full" />
            </UFormField>
            <UFormField label="Email" required>
              <UInput v-model="guestForm.guest_email" type="email" placeholder="jane@example.com" class="w-full" />
            </UFormField>
            <UFormField label="Notes" hint="Optional">
              <UTextarea v-model="guestForm.notes" placeholder="Setup requirements, shoot type, etc." :rows="2" class="w-full" />
            </UFormField>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="soft" :disabled="guestSubmitting" @click="guestModalOpen = false">Cancel</UButton>
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
</template>
