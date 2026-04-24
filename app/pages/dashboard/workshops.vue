<script setup lang="ts">
import { DateTime } from 'luxon'

definePageMeta({ middleware: ['auth', 'membership-required'] })

const toast = useToast()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const currentUserId = computed(() => user.value?.sub ?? user.value?.id ?? null)

type BookingPolicy = {
  holdCreditCost: number
  minHoldBookingHours: number
  holdMinEndHour: number
  holdEndHour: number
}

type HoldSummary = {
  activeHoldSlotsRemaining?: number
  holdsIncluded: number
  activeHolds: number
  holdsUsedThisCycle?: number
  cycleStartIso?: string | null
  cycleEndIso?: string | null
  paidHoldBalance: number
  includedHoldsRemaining: number
  canRequestHoldNow: boolean
}

type WorkshopAccess = {
  workshopBookingEnabled: boolean
  workshopCreditMultiplier: number
}

type BookingPreview = {
  creditsNeeded: number
  peakMultiplier: number
  durationHours: number
  tierName: string | null
  breakdown: { isPeakWindow: boolean }
  bookingKind: 'standard' | 'workshop'
  workshopMultiplier: number
}

type BookingCreateResponse = {
  burned: number | null
  newBalance: number | null
}

type ApiErrorLike = {
  data?: {
    statusMessage?: string
    code?: string
    data?: { code?: string }
  }
  message?: string
}

const { data: workshopAccess, refresh: refreshWorkshopAccess } = await useAsyncData('workshop:access', async () => {
  return await $fetch<WorkshopAccess>('/api/workshops/access')
})

const { data: bookingPolicy } = await useAsyncData('workshop:policy', async () => {
  return await $fetch<BookingPolicy>('/api/bookings/policy')
})

const { data: holdSummary, refresh: refreshHoldSummary } = await useAsyncData('workshop:hold-summary', async () => {
  try {
    return await $fetch<HoldSummary>('/api/holds/summary')
  } catch {
    return {
      activeHoldSlotsRemaining: 0,
      holdsIncluded: 0,
      activeHolds: 0,
      holdsUsedThisCycle: 0,
      cycleStartIso: null,
      cycleEndIso: null,
      paidHoldBalance: 0,
      includedHoldsRemaining: 0,
      canRequestHoldNow: false
    } as HoldSummary
  }
})

const holdCreditCost = computed(() => Number(bookingPolicy.value?.holdCreditCost ?? 2))
const minHoldBookingHours = computed(() => Math.max(1, Number(bookingPolicy.value?.minHoldBookingHours ?? 4)))
const holdMinEndHour = computed(() => {
  const raw = Number(bookingPolicy.value?.holdMinEndHour ?? 18)
  return Number.isFinite(raw) ? Math.max(0, Math.min(23, Math.floor(raw))) : 18
})
const holdEndHour = computed(() => {
  const raw = Number(bookingPolicy.value?.holdEndHour ?? 8)
  return Number.isFinite(raw) ? Math.max(0, Math.min(23, Math.floor(raw))) : 8
})

const open = ref(false)
const confirming = ref(false)
const selected = ref<{ start: Date, end: Date } | null>(null)
const preview = ref<BookingPreview | null>(null)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)
const balanceLoading = ref(false)
const creditBalance = ref(0)
const calendarKey = ref(0)

const form = reactive({
  notes: '',
  request_hold: false,
  holdPaymentMethod: 'auto' as 'auto' | 'token' | 'credits',
  workshopTitle: '',
  workshopDescription: '',
  workshopLink: '',
  liabilityAccepted: false
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
  form.holdPaymentMethod = holdPaymentOptions.value[0]?.value ?? 'auto'
})

function validateHoldWindowForSelection(start: Date, end: Date) {
  const startLa = DateTime.fromJSDate(start).setZone('America/Los_Angeles')
  const endLa = DateTime.fromJSDate(end).setZone('America/Los_Angeles')
  if (!startLa.isValid || !endLa.isValid || endLa <= startLa) {
    return { eligible: false, reasons: ['Select a valid time range to request a hold.'] }
  }
  const reasons: string[] = []
  const durationHours = endLa.diff(startLa, 'hours').hours
  if (durationHours < minHoldBookingHours.value) {
    reasons.push(`Equipment hold eligibility requires a booking of at least ${minHoldBookingHours.value} hours.`)
  }
  const requiredEnd = endLa.startOf('day').set({ hour: holdMinEndHour.value, minute: 0, second: 0, millisecond: 0 })
  if (endLa < requiredEnd) {
    const label = DateTime.fromObject({ hour: holdMinEndHour.value, minute: 0 }, { zone: 'America/Los_Angeles' }).toFormat('h:mm a')
    reasons.push(`Equipment hold eligibility requires the booking to end at or after ${label}.`)
  }
  return { eligible: reasons.length === 0, reasons }
}

const holdSelectionEligibility = computed(() => {
  if (!selected.value) return { eligible: false, reasons: ['Select a time slot to check hold eligibility.'] }
  const base = validateHoldWindowForSelection(selected.value.start, selected.value.end)
  if (!base.eligible) return base
  const activeSlotsRemaining = Math.max(0, Number(holdSummary.value?.activeHoldSlotsRemaining ?? 0))
  if (activeSlotsRemaining <= 0) {
    return { eligible: false, reasons: ['Active hold cap reached. Wait for an existing hold to finish before adding another.'] }
  }
  const paymentPathAvailable = Number(holdSummary.value?.includedHoldsRemaining ?? 0) > 0
    || Number(holdSummary.value?.paidHoldBalance ?? 0) > 0
    || holdCreditCost.value > 0
  if (!paymentPathAvailable) {
    return { eligible: false, reasons: ['No hold payment path is currently available for this booking.'] }
  }
  return { eligible: true, reasons: [] as string[] }
})

const canShowHoldOption = computed(() => holdSelectionEligibility.value.eligible)

watch(canShowHoldOption, (allowed) => {
  if (!allowed) {
    form.request_hold = false
    form.holdPaymentMethod = 'auto'
  }
})

function readApiErrorMessage(error: unknown) {
  const maybe = error as ApiErrorLike
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

async function refreshCreditBalance() {
  if (!currentUserId.value) return
  balanceLoading.value = true
  try {
    const { data, error } = await supabase
      .from('credit_balance')
      .select('balance')
      .eq('user_id', currentUserId.value)
      .maybeSingle()
    if (error) throw error
    creditBalance.value = Math.max(0, Number(data?.balance ?? 0))
  } catch (error) {
    console.error('[workshops] failed to load credit balance', error)
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
        mode: 'member',
        booking_kind: 'workshop'
      }
    })
    preview.value = res
  } catch (error: unknown) {
    previewError.value = readApiErrorMessage(error)
  } finally {
    previewLoading.value = false
  }
}

function onSelect(payload: { start: Date, end: Date }) {
  if (!workshopAccess.value?.workshopBookingEnabled) return
  selected.value = payload
  form.notes = ''
  form.request_hold = false
  form.holdPaymentMethod = 'auto'
  form.workshopTitle = ''
  form.workshopDescription = ''
  form.workshopLink = ''
  form.liabilityAccepted = false
  preview.value = null
  previewError.value = null
  open.value = true
  refreshCreditBalance()
  refreshHoldSummary()
  fetchPreview(payload.start, payload.end)
}

function closeModal(force = false) {
  if (confirming.value && !force) return
  open.value = false
  selected.value = null
  preview.value = null
  previewError.value = null
}

const requiredCredits = computed(() => {
  const previewCredits = Number(preview.value?.creditsNeeded ?? 0)
  if (!form.request_hold || !holdSelectionRequired.value) return previewCredits

  if (form.holdPaymentMethod === 'credits') return previewCredits + holdCreditCost.value
  if (form.holdPaymentMethod === 'auto' && !canUseHoldToken.value && canUseHoldCredits.value) {
    return previewCredits + holdCreditCost.value
  }
  return previewCredits
})

const hasInsufficientCredits = computed(() => {
  if (!preview.value || previewLoading.value || previewError.value) return false
  return creditBalance.value < requiredCredits.value
})

async function confirmWorkshopBooking() {
  if (!selected.value) return
  if (!form.liabilityAccepted) {
    toast.add({
      title: 'Liability acknowledgement required',
      description: 'Please accept liability before creating this workshop booking.',
      color: 'warning'
    })
    return
  }
  if (hasInsufficientCredits.value) {
    toast.add({
      title: 'Insufficient credits',
      description: `This workshop booking needs ${requiredCredits.value} credits.`,
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
        booking_kind: 'workshop',
        workshop_title: form.workshopTitle || null,
        workshop_description: form.workshopDescription || null,
        workshop_link: form.workshopLink || null,
        workshop_liability_acknowledged: form.liabilityAccepted,
        request_hold: form.request_hold,
        hold_payment_method: holdSelectionRequired.value ? form.holdPaymentMethod : 'auto'
      }
    })

    toast.add({
      title: 'Workshop booked',
      description: `${res.burned ?? requiredCredits.value} credits used.`,
      color: 'success'
    })
    closeModal(true)
    calendarKey.value += 1
    await Promise.allSettled([refreshCreditBalance(), refreshHoldSummary(), refreshWorkshopAccess()])
  } catch (error: unknown) {
    toast.add({
      title: 'Could not create workshop booking',
      description: readApiErrorMessage(error),
      color: 'error'
    })
  } finally {
    confirming.value = false
  }
}

function formatDateTime(value: Date) {
  return value.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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
    <DashboardPageScaffold
      panel-id="workshops"
      title="Workshop Bookings"
    >
      <template #right>
        <DashboardActionGroup
          :secondary="[
            {
              label: 'My bookings',
              icon: 'i-lucide-list-checks',
              color: 'neutral',
              variant: 'soft',
              to: '/dashboard/bookings'
            }
          ]"
        />
      </template>

      <div class="space-y-4">
        <UAlert
          color="info"
          variant="soft"
          icon="i-lucide-megaphone"
          title="Workshop mode"
          :description="`Workshop bookings consume ${workshopAccess?.workshopCreditMultiplier ?? 2}x credits per hour and can optionally publish a global workshop promo on calendars.`"
        />

        <UAlert
          v-if="!workshopAccess?.workshopBookingEnabled"
          color="warning"
          variant="soft"
          icon="i-lucide-ban"
          title="Workshop booking is disabled"
          description="Ask an admin to enable workshop booking on your account."
        >
          <template #actions>
            <UButton
              color="neutral"
              variant="soft"
              to="/dashboard/book"
            >
              Back to standard booking
            </UButton>
          </template>
        </UAlert>

        <AvailabilityCalendar
          v-if="workshopAccess?.workshopBookingEnabled"
          :key="calendarKey"
          endpoint="/api/calendar/member?booking_kind=workshop"
          @select="onSelect"
        />
        <DashboardSectionState
          v-else
          state="empty"
          title="Workshop booking unavailable"
          description="Workshop booking access must be enabled on your account by an admin."
        />
      </div>
    </DashboardPageScaffold>

    <UModal
      v-model:open="open"
      :dismissible="!confirming"
    >
      <template #content>
        <UCard
          class="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-h-[calc(100dvh-4rem)]"
          :ui="{ body: 'min-h-0 overflow-y-scroll' }"
        >
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-base">
                Confirm workshop booking
              </h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="confirming"
                @click="closeModal()"
              />
            </div>
          </template>

          <div class="space-y-4 pr-1">
            <section
              v-if="selected"
              class="space-y-2"
            >
              <p class="text-xs uppercase tracking-wide text-dimmed">
                Session details
              </p>
              <div class="rounded-lg bg-elevated p-3 space-y-1.5 text-sm">
                <div class="flex justify-between">
                  <span class="text-dimmed">Start</span>
                  <span class="font-medium">{{ formatDateTime(selected.start) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-dimmed">End</span>
                  <span class="font-medium">{{ formatDateTime(selected.end) }}</span>
                </div>
              </div>
            </section>

            <section class="space-y-2 rounded-lg border border-default p-3">
              <p class="text-xs uppercase tracking-wide text-dimmed">
                Credits and hold
              </p>

              <div
                v-if="previewLoading"
                class="text-sm text-dimmed"
              >
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
                <div class="flex justify-between items-center">
                  <span class="text-dimmed">Workshop multiplier</span>
                  <span>{{ preview.workshopMultiplier }}x</span>
                </div>
                <div class="flex justify-between items-center border-t border-default pt-2 mt-1">
                  <span class="font-medium">Total</span>
                  <span class="text-lg font-semibold">{{ preview.creditsNeeded }} credits</span>
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

              <UAlert
                v-if="hasInsufficientCredits"
                class="mt-2"
                color="warning"
                variant="soft"
                title="Insufficient credits"
                :description="`This workshop booking needs ${requiredCredits} credits, but you currently have ${creditBalance}.`"
              />

              <UAlert
                v-if="!canShowHoldOption"
                class="mt-2"
                color="warning"
                variant="soft"
                :description="holdSelectionEligibility.reasons.join(' ')"
              />
              <UCheckbox
                v-if="canShowHoldOption"
                v-model="form.request_hold"
                label="Request overnight equipment hold"
                :description="`Extends your reservation until ${DateTime.fromObject({ hour: holdEndHour, minute: 0 }, { zone: 'America/Los_Angeles' }).toFormat('h:mm a')} next day.`"
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
              </UFormField>
            </section>

            <section class="space-y-2">
              <UFormField
                label="Workshop title"
                hint="Optional"
              >
                <UInput
                  v-model="form.workshopTitle"
                  placeholder="Lighting Fundamentals"
                />
              </UFormField>
              <UFormField
                label="Workshop description"
                hint="Optional"
              >
                <UTextarea
                  v-model="form.workshopDescription"
                  :rows="4"
                  placeholder="Describe the workshop details shown on calendars."
                />
              </UFormField>
              <UFormField
                label="Workshop link"
                hint="Optional"
              >
                <UInput
                  v-model="form.workshopLink"
                  placeholder="https://..."
                />
              </UFormField>
            </section>

            <section class="space-y-2 rounded-lg border border-default p-3">
              <UCheckbox
                v-model="form.liabilityAccepted"
                label="I accept liability for workshop attendees."
              />
              <p class="text-xs text-dimmed">
                By creating a workshop booking, you accept responsibility for all attendees and activities during the reserved time.
              </p>
            </section>

            <section class="space-y-2">
              <UFormField
                label="Internal notes"
                hint="Optional"
              >
                <UTextarea
                  v-model="form.notes"
                  :rows="2"
                  placeholder="Internal booking notes"
                />
              </UFormField>
            </section>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="confirming"
                @click="closeModal()"
              >
                Cancel
              </UButton>
              <UButton
                :loading="confirming"
                :disabled="hasInsufficientCredits || !form.liabilityAccepted || !!previewError"
                @click="confirmWorkshopBooking"
              >
                Confirm workshop booking
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
