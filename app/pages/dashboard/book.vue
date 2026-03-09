<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'membership-required'] })

const toast = useToast()
const router = useRouter()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin } = useCurrentUser()
type BookingPolicy = {
  memberRescheduleNoticeHours: number
  holdCreditCost: number
}

type HoldSummary = {
  holdsIncluded: number
  activeHolds: number
  holdsUsedThisCycle?: number
  cycleStartIso?: string | null
  cycleEndIso?: string | null
  paidHoldBalance: number
  includedHoldsRemaining: number
  canRequestHoldNow: boolean
}

const { data: bookingPolicy } = await useAsyncData('book:policy', async () => {
  return await $fetch<BookingPolicy>('/api/bookings/policy')
})
const { data: holdSummary, refresh: refreshHoldSummary } = await useAsyncData('book:hold-summary', async () => {
  return await $fetch<HoldSummary>('/api/holds/summary')
})
const memberRescheduleNoticeHours = computed(() => Number(bookingPolicy.value?.memberRescheduleNoticeHours ?? 24))
const holdCreditCost = computed(() => Number(bookingPolicy.value?.holdCreditCost ?? 2))

type BookingPreview = {
  creditsNeeded: number
  peakMultiplier: number
  durationHours: number
  tierName: string | null
  breakdown: { isPeakWindow: boolean }
}

type BookingCreateResponse = {
  burned: number | null
  newBalance: number | null
}

type ApiErrorLike = {
  data?: { statusMessage?: string }
  message?: string
}

function isCreditError(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('insufficient credits')
}

function isHoldError(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('hold')
}

// Modal state
const open = ref(false)
const confirming = ref(false)
const ownBookingActionOpen = ref(false)
const ownBookingActionLoading = ref(false)

// Selected time slot
const selected = ref<{ start: Date, end: Date } | null>(null)
const clickedBooking = ref<{
  bookingId: string
  start: string
  end: string
  status?: string
  notes?: string
} | null>(null)

// Form fields inside the modal
const form = reactive({
  notes: '',
  request_hold: false,
  holdPaymentMethod: 'auto' as 'auto' | 'token' | 'credits'
})

const holdSelectionRequired = computed(() =>
  form.request_hold && Number(holdSummary.value?.includedHoldsRemaining ?? 0) <= 0
)
const canUseHoldToken = computed(() => Number(holdSummary.value?.paidHoldBalance ?? 0) > 0)
const canUseHoldCredits = computed(() => holdCreditCost.value > 0)

const holdPaymentOptions = computed(() => {
  const options: { label: string, value: 'auto' | 'token' | 'credits' }[] = []
  if (canUseHoldToken.value) options.push({ label: `Use hold token (${holdSummary.value?.paidHoldBalance ?? 0} available)`, value: 'token' })
  if (canUseHoldCredits.value) options.push({ label: `Use ${holdCreditCost.value} credit${holdCreditCost.value === 1 ? '' : 's'}`, value: 'credits' })
  return options
})

watch(holdSelectionRequired, (required) => {
  if (!required) {
    form.holdPaymentMethod = 'auto'
    return
  }
  const first = holdPaymentOptions.value[0]?.value
  form.holdPaymentMethod = first ?? 'auto'
})

// Credit preview — fetched when a time slot is selected
const preview = ref<BookingPreview | null>(null)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)
const balanceLoading = ref(false)
const creditBalance = ref<number>(0)

// Bump this key to force calendar to remount + reload events after a booking
const calendarKey = ref(0)

async function refreshCreditBalance() {
  if (!user.value?.id) return
  balanceLoading.value = true
  try {
    const { data, error } = await supabase
      .from('credit_balance')
      .select('balance')
      .eq('user_id', user.value.id)
      .maybeSingle()

    if (error) throw error
    creditBalance.value = Math.max(0, Number(data?.balance ?? 0))
  } catch (error) {
    console.error('[book] failed to load credit balance', error)
  } finally {
    balanceLoading.value = false
  }
}

async function fetchPreview(start: Date, end: Date) {
  previewLoading.value = true
  previewError.value = null
  preview.value = null
  try {
    const res = await $fetch<BookingPreview>('/api/bookings/preview', {
      query: {
        start: start.toISOString(),
        end: end.toISOString(),
        mode: 'member'
      }
    })
    preview.value = res
  } catch (error: unknown) {
    const maybe = error as ApiErrorLike
    previewError.value = maybe.data?.statusMessage ?? maybe.message ?? 'Could not calculate cost'
  } finally {
    previewLoading.value = false
  }
}

function onSelect(payload: { start: Date, end: Date }) {
  selected.value = payload
  form.notes = ''
  form.request_hold = false
  form.holdPaymentMethod = 'auto'
  preview.value = null
  previewError.value = null
  open.value = true
  refreshCreditBalance()
  refreshHoldSummary()
  fetchPreview(payload.start, payload.end)
}

function closeModal() {
  if (confirming.value) return
  open.value = false
  preview.value = null
  previewError.value = null
}

function onOwnBookingClick(payload: {
  bookingId: string
  start: string
  end: string
  status?: string
  notes?: string
}) {
  clickedBooking.value = payload
  ownBookingActionOpen.value = true
}

function clickedBookingHoursUntilStart() {
  if (!clickedBooking.value?.start) return Number.NaN
  const startMs = new Date(clickedBooking.value.start).getTime()
  return (startMs - Date.now()) / (1000 * 60 * 60)
}

const ownBookingHasPassed = computed(() => {
  const hours = clickedBookingHoursUntilStart()
  return Number.isFinite(hours) && hours <= 0
})

const ownBookingWithinNoticeWindow = computed(() => {
  const hours = clickedBookingHoursUntilStart()
  return Number.isFinite(hours) && hours < memberRescheduleNoticeHours.value
})

const ownBookingCanModify = computed(() => {
  if (ownBookingHasPassed.value) return false
  if (isAdmin.value) return true
  return !ownBookingWithinNoticeWindow.value
})

const ownBookingCanCancel = computed(() => {
  if (ownBookingHasPassed.value) return false
  if (isAdmin.value) return true
  return !ownBookingWithinNoticeWindow.value
})

const ownBookingLockReason = computed(() => {
  if (ownBookingHasPassed.value) return 'This booking has already started or passed and can no longer be modified or canceled.'
  if (!isAdmin.value && ownBookingWithinNoticeWindow.value) return `Members cannot modify/cancel within ${memberRescheduleNoticeHours.value} hours of start.`
  return ''
})

function closeOwnBookingActions() {
  if (ownBookingActionLoading.value) return
  ownBookingActionOpen.value = false
  clickedBooking.value = null
}

async function cancelClickedBooking() {
  if (!clickedBooking.value?.bookingId) return
  if (!ownBookingCanCancel.value) {
    toast.add({ title: 'Cannot cancel booking', description: ownBookingLockReason.value || 'Booking is locked', color: 'warning' })
    return
  }
  ownBookingActionLoading.value = true
  try {
    await $fetch(`/api/bookings/${clickedBooking.value.bookingId}`, { method: 'DELETE' })
    toast.add({ title: 'Booking canceled', color: 'success' })
    closeOwnBookingActions()
    calendarKey.value++
    await refreshHoldSummary()
  } catch (error: unknown) {
    const maybe = error as ApiErrorLike
    toast.add({
      title: 'Could not cancel booking',
      description: maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error',
      color: 'error'
    })
  } finally {
    ownBookingActionLoading.value = false
  }
}

async function manageClickedBooking() {
  if (!clickedBooking.value?.bookingId) return
  if (!ownBookingCanModify.value) {
    toast.add({ title: 'Cannot reschedule booking', description: ownBookingLockReason.value || 'Booking is locked', color: 'warning' })
    return
  }
  await router.push(`/dashboard/bookings?reschedule=${encodeURIComponent(clickedBooking.value.bookingId)}`)
}

async function confirmBooking() {
  if (!selected.value) return
  if (hasInsufficientCredits.value) {
    toast.add({
      title: 'Insufficient credits',
      description: 'Please buy more credits before booking this slot.',
      color: 'warning'
    })
    return
  }
  confirming.value = true
  try {
    const res = await $fetch<BookingCreateResponse>('/api/bookings/create', {
      method: 'POST',
      body: {
        start_time: selected.value.start.toISOString(),
        end_time: selected.value.end.toISOString(),
        notes: form.notes || null,
        request_hold: form.request_hold,
        hold_payment_method: holdSelectionRequired.value ? form.holdPaymentMethod : 'auto'
      }
    })

    toast.add({
      title: 'Studio booked!',
      description: `${res.burned} credits used. New balance: ${res.newBalance} credits.`,
      color: 'success'
    })
    closeModal()
    calendarKey.value++ // refresh calendar events
    await refreshCreditBalance()
  } catch (error: unknown) {
    const maybe = error as ApiErrorLike
    const msg = maybe.data?.statusMessage ?? maybe.message ?? 'Booking failed'
    toast.add({ title: 'Could not book', description: msg, color: 'error' })
    if (isCreditError(msg)) {
      await router.push('/dashboard/membership#credits')
      return
    }
    if (isHoldError(msg)) {
      await router.push('/dashboard/membership#holds')
    }
  } finally {
    confirming.value = false
  }
}

const requiredCredits = computed(() => {
  const previewCredits = Number(preview.value?.creditsNeeded ?? 0)
  if (!form.request_hold || !holdSelectionRequired.value) return previewCredits

  if (form.holdPaymentMethod === 'credits') {
    return previewCredits + holdCreditCost.value
  }

  if (form.holdPaymentMethod === 'auto' && !canUseHoldToken.value && canUseHoldCredits.value) {
    return previewCredits + holdCreditCost.value
  }

  return previewCredits
})

const hasInsufficientCredits = computed(() => {
  if (!preview.value || previewLoading.value || !!previewError.value) return false
  return creditBalance.value < requiredCredits.value
})

function goToBuyCredits() {
  closeModal()
  router.push('/dashboard/credits')
}

function formatDateTime(d: Date) {
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/Los_Angeles'
  })
}

function formatDuration(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours === Math.floor(hours)) return `${hours}h`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}h ${m}m`
}

function formatPeakCredits(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <UDashboardPanel
      id="book"
      class="min-h-0 flex-1"
    >
      <template #header>
        <UDashboardNavbar
          title="Book Studio"
          :ui="{ right: 'gap-3' }"
        >
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-list-checks"
              to="/dashboard/bookings"
            >
              My bookings
            </UButton>
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar>
          <template #left>
            <p class="text-sm text-dimmed">
              Click and drag on the calendar to select a time slot. Your tier's booking window and peak-hour credit rates apply. Reschedules require {{ memberRescheduleNoticeHours }}+ hours notice.
            </p>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <div class="p-4">
          <AvailabilityCalendar
            :key="calendarKey"
            endpoint="/api/calendar/member"
            @select="onSelect"
            @booking-click="onOwnBookingClick"
          />
        </div>
      </template>
    </UDashboardPanel>

    <!-- Booking confirmation modal -->
    <UModal
      v-model:open="open"
      :dismissible="!confirming"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-base">
                Confirm booking
              </h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="confirming"
                @click="closeModal"
              />
            </div>
          </template>

          <div class="space-y-4">
            <!-- Time summary -->
            <div
              v-if="selected"
              class="rounded-lg bg-elevated p-3 space-y-1.5 text-sm"
            >
              <div class="flex justify-between">
                <span class="text-dimmed">Start</span>
                <span class="font-medium">{{ formatDateTime(selected.start) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-dimmed">End</span>
                <span class="font-medium">{{ formatDateTime(selected.end) }}</span>
              </div>
            </div>

            <!-- Credit cost preview -->
            <div class="rounded-lg border border-default p-3 space-y-2">
              <div class="text-sm font-medium">
                Credit cost
              </div>

              <div
                v-if="previewLoading"
                class="flex items-center gap-2 text-sm text-dimmed"
              >
                <UIcon
                  name="i-lucide-loader-circle"
                  class="size-4 animate-spin"
                />
                Calculating…
              </div>

              <div
                v-else-if="previewError"
                class="text-sm text-red-500 dark:text-red-400"
              >
                {{ previewError }}
              </div>

              <div
                v-else-if="preview"
                class="space-y-1 text-sm"
              >
                <div class="flex justify-between items-center">
                  <span class="text-dimmed">Duration</span>
                  <span>{{ formatDuration(preview.durationHours) }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-dimmed">Rate</span>
                  <UBadge
                    :color="preview.breakdown.isPeakWindow ? 'warning' : 'success'"
                    variant="soft"
                    size="sm"
                  >
                    {{ preview.breakdown.isPeakWindow ? `Peak (${formatPeakCredits(preview.peakMultiplier)} credits/hr)` : 'Off-peak (1 credit/hr)' }}
                  </UBadge>
                </div>
                <div class="flex justify-between items-center border-t border-default pt-2 mt-1">
                  <span class="font-medium">Total</span>
                  <span class="text-lg font-semibold">{{ preview.creditsNeeded }} credits</span>
                </div>
                <div
                  v-if="preview.tierName"
                  class="text-xs text-dimmed"
                >
                  Calculated for your {{ preview.tierName }} membership
                </div>
                <div class="mt-2 flex justify-between items-center text-xs text-dimmed">
                  <span>Available now</span>
                  <span>{{ balanceLoading ? 'Loading…' : `${creditBalance} credits` }}</span>
                </div>
                <div class="flex justify-between items-center text-xs text-dimmed">
                  <span>Required</span>
                  <span>{{ requiredCredits }} credits</span>
                </div>
              </div>
            </div>

            <UAlert
              v-if="hasInsufficientCredits"
              color="warning"
              variant="soft"
              icon="i-lucide-wallet-cards"
              title="Insufficient credits"
              :description="`This booking needs ${requiredCredits} credits, but you currently have ${creditBalance}.`"
            >
              <template #actions>
                <UButton
                  size="sm"
                  color="warning"
                  variant="soft"
                  @click="goToBuyCredits"
                >
                  Buy credits
                </UButton>
              </template>
            </UAlert>

            <!-- Notes -->
            <UFormField
              label="Notes"
              hint="Optional"
            >
              <UTextarea
                v-model="form.notes"
                placeholder="Setup requirements, shoot type, etc."
                :rows="2"
                class="w-full"
              />
            </UFormField>

            <!-- Overnight hold -->
            <UCheckbox
              v-model="form.request_hold"
              label="Request overnight equipment hold"
              description="Extends your reservation until the earlier of 10am next day or peak-hours start. Monthly hold cap is used first, then paid hold add-ons or credits."
            />

            <UFormField
              v-if="holdSelectionRequired"
              label="How to cover this hold"
            >
              <USelect
                v-model="form.holdPaymentMethod"
                :items="holdPaymentOptions"
                value-key="value"
                label-key="label"
                placeholder="Choose hold payment method"
              />
              <p class="mt-1 text-xs text-dimmed">
                Included holds are currently exhausted. Choose to use a hold token or {{ holdCreditCost }} credits.
              </p>
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="confirming"
                @click="closeModal"
              >
                Cancel
              </UButton>
              <UButton
                :loading="confirming"
                :disabled="previewLoading || !!previewError || !preview || hasInsufficientCredits"
                @click="confirmBooking"
              >
                Book {{ preview ? `· ${preview.creditsNeeded} cr` : '' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal
      v-model:open="ownBookingActionOpen"
      :dismissible="!ownBookingActionLoading"
    >
      <template #content>
        <UCard v-if="clickedBooking">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h3 class="font-semibold text-base">
                Manage booking
              </h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="ownBookingActionLoading"
                @click="closeOwnBookingActions"
              />
            </div>
          </template>

          <div class="space-y-2 text-sm">
            <div class="text-dimmed">
              You already own this booking slot.
            </div>
            <UAlert
              v-if="ownBookingLockReason"
              color="warning"
              variant="soft"
              icon="i-lucide-lock"
              :description="ownBookingLockReason"
            />
            <div class="rounded-lg border border-default p-3">
              <div>
                {{ formatDateTime(new Date(clickedBooking.start)) }} to {{ formatDateTime(new Date(clickedBooking.end)) }}
              </div>
              <div
                v-if="clickedBooking.notes"
                class="mt-1 text-xs text-dimmed"
              >
                {{ clickedBooking.notes }}
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="ownBookingActionLoading || !ownBookingCanModify"
                @click="manageClickedBooking"
              >
                Modify / reschedule
              </UButton>
              <UButton
                color="error"
                :loading="ownBookingActionLoading"
                :disabled="!ownBookingCanCancel"
                @click="cancelClickedBooking"
              >
                Cancel booking
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
