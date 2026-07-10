<script setup lang="ts">
import { DateTime } from 'luxon'
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'
import ManualBookingTimeModal from '~~/app/components/booking/ManualBookingTimeModal.vue'

definePageMeta({ middleware: ['auth'] })

const toast = useToast()
const router = useRouter()
const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin } = useCurrentUser()
const currentUserId = computed(() => user.value?.sub ?? user.value?.id ?? null)
type MembershipRow = {
  status: string | null
  current_period_end: string | null
  canceled_at: string | null
  membership_source: string | null
  billing_provider: string | null
}

const {
  data: membershipData,
  pending: membershipPending,
  error: membershipError,
  refresh: refreshMembership
} = await useAsyncData('book:membership-state', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('status,current_period_end,canceled_at,membership_source,billing_provider')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as MembershipRow | null
})
const membershipState = computed(() => resolveMembershipUiState(membershipData.value))
const membershipResolved = computed(() => !membershipPending.value && !membershipError.value)
const hasActiveMembership = computed(() => membershipResolved.value && membershipState.value === 'active')
const isManualMembership = computed(() =>
  (membershipData.value?.membership_source ?? membershipData.value?.billing_provider ?? '').toLowerCase() === 'manual'
)
type BookingPolicy = {
  memberRescheduleNoticeHours: number
  holdCreditCost: number
  minHoldBookingHours: number
  holdMinEndHour: number
  holdEndHour: number
  guestBookingWindowDays?: number
  guestBookingStartHour?: number
  guestBookingEndHour?: number
  guestMinBookingHours?: number
  guestBookingIncrementMinutes?: number
}

type HoldSummary = {
  activeHoldCap?: number
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

const { data: bookingPolicy } = await useAsyncData('book:policy', async () => {
  return await $fetch<BookingPolicy>('/api/bookings/policy')
})
const { data: holdSummary, error: holdSummaryError, refresh: refreshHoldSummary } = await useAsyncData('book:hold-summary', async () => {
  return await $fetch<HoldSummary>('/api/holds/summary')
})
const memberRescheduleNoticeHours = computed(() => Number(bookingPolicy.value?.memberRescheduleNoticeHours ?? 24))
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

type BookingPreview = {
  creditsNeeded: number
  baseCreditsNeeded?: number
  peakMultiplier: number
  durationHours: number
  tierName: string | null
  mode?: 'member' | 'guest'
  accountState?: 'active_member' | 'guest'
  hasActiveMembership?: boolean
  remainingCredits?: number
  shortfallCredits?: number
  amountDueCents?: number | null
  totalCents?: number | null
  ratePerCreditCents?: number | null
  rateKind?: 'standard' | 'standby'
  canRequestHold?: boolean
  guestPolicy?: {
    bookingWindowDays: number
    startHour: number
    endHour: number
    minBookingHours: number
    bookingIncrementMinutes: number
    creditExpiryDays: number
  } | null
  standby?: {
    eligible: boolean
    reason: string
    discountMultiplier: number
    minOpenSlotHours: number
  }
  breakdown: { isPeakWindow: boolean }
}

type BookingCreateResponse = {
  status?: string
  bookingId?: string
  checkoutUrl?: string
  amountDueCents?: number
  shortfallCredits?: number
  burned: number | null
  newBalance: number | null
}

type ApiErrorLike = {
  data?: {
    statusMessage?: string
    code?: string
    data?: {
      code?: string
    }
  }
  message?: string
}

function getApiErrorCode(error: unknown) {
  const maybe = error as ApiErrorLike
  return maybe.data?.code ?? maybe.data?.data?.code ?? null
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
const manualBookingOpen = ref(false)
const confirming = ref(false)
const ownBookingActionOpen = ref(false)
const ownBookingActionLoading = ref(false)
const ownBookingDestructiveConfirmOpen = ref(false)
const ownBookingDestructiveAction = ref<'cancel' | 'restart' | null>(null)

// Selected time slot
const selected = ref<{ start: Date, end: Date } | null>(null)
const clickedBooking = ref<{
  bookingId: string
  start: string
  end: string
  status?: string
  rateKind?: string
  notes?: string
  paymentExpiresAt?: string | null
} | null>(null)
const clickedBookingNoteDraft = ref('')

// Form fields inside the modal
const form = reactive({
  notes: '',
  request_hold: false,
  holdPaymentMethod: 'auto' as 'auto' | 'token' | 'credits',
  rateKind: 'standard' as 'standard' | 'standby'
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
  if (holdSummaryError.value) return { eligible: false, reasons: ['Hold availability could not be loaded. Retry before adding a hold.'] }
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

const isGuestBooking = computed(() => membershipResolved.value && !hasActiveMembership.value)
const manualBookingIncrementMinutes = computed(() =>
  hasActiveMembership.value ? 30 : Math.max(15, Number(bookingPolicy.value?.guestBookingIncrementMinutes ?? 60))
)
const manualBookingMinDurationMinutes = computed(() =>
  hasActiveMembership.value ? 30 : Math.max(30, Number(bookingPolicy.value?.guestMinBookingHours ?? 2) * 60)
)
const manualBookingDefaultDurationMinutes = computed(() =>
  hasActiveMembership.value ? 60 : manualBookingMinDurationMinutes.value
)
const manualBookingStartHour = computed(() =>
  hasActiveMembership.value ? 0 : Math.max(0, Math.min(23, Number(bookingPolicy.value?.guestBookingStartHour ?? 9)))
)
const manualBookingEndHour = computed(() =>
  hasActiveMembership.value ? 24 : Math.max(manualBookingStartHour.value + 1, Math.min(24, Number(bookingPolicy.value?.guestBookingEndHour ?? 21)))
)

// Credit preview must be initialized before canShowHoldOption is watched.
// Active members evaluate the hold option during setup, while guests short-circuit before preview is read.
const preview = ref<BookingPreview | null>(null)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)
const balanceLoading = ref(false)
const creditBalance = ref<number>(0)

const canShowHoldOption = computed(() =>
  hasActiveMembership.value
  && form.rateKind !== 'standby'
  && Boolean(preview.value?.canRequestHold ?? true)
  && holdSelectionEligibility.value.eligible
)

watch(holdSelectionRequired, (required) => {
  if (!required) {
    form.holdPaymentMethod = 'auto'
    return
  }
  const first = holdPaymentOptions.value[0]?.value
  form.holdPaymentMethod = first ?? 'auto'
})

watch(canShowHoldOption, (allowed) => {
  if (!allowed) {
    form.request_hold = false
    form.holdPaymentMethod = 'auto'
  }
})

const calendarRef = ref<{ refresh: () => Promise<void> | void } | null>(null)
const bookingIntentConsumed = ref(false)

function refreshCalendar() {
  void calendarRef.value?.refresh()
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
    creditBalance.value = Number(data?.balance ?? 0)
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
        mode: hasActiveMembership.value ? 'member' : 'guest',
        rate_kind: form.rateKind
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

function onSelect(payload: { start: Date, end: Date, rateKind?: 'standard' | 'standby' }) {
  if (!membershipResolved.value) return
  const nextRateKind = payload.rateKind === 'standby' ? 'standby' : 'standard'
  form.rateKind = nextRateKind
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

function readQueryString(value: unknown) {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : undefined
}

watch(
  [
    membershipResolved,
    () => route.query.start,
    () => route.query.end,
    () => route.query.rateKind
  ],
  ([resolved, rawStart, rawEnd, rawRateKind]) => {
    if (!resolved || bookingIntentConsumed.value) return
    const startValue = readQueryString(rawStart)
    const endValue = readQueryString(rawEnd)
    if (!startValue || !endValue) return

    bookingIntentConsumed.value = true
    const start = new Date(startValue)
    const end = new Date(endValue)
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      onSelect({
        start,
        end,
        rateKind: readQueryString(rawRateKind) === 'standby' ? 'standby' : 'standard'
      })
    }

    const nextQuery = { ...route.query }
    delete nextQuery.start
    delete nextQuery.end
    delete nextQuery.rateKind
    void router.replace({ query: nextQuery })
  },
  { immediate: true }
)

function openManualBookingModal() {
  if (!membershipResolved.value) return
  manualBookingOpen.value = true
}

function onManualBookingSubmit(payload: { start: Date, end: Date, rateKind?: 'standard' | 'standby' }) {
  onSelect(payload)
}

function closeModal(force = false) {
  if (confirming.value && !force) return
  open.value = false
  selected.value = null
  form.notes = ''
  form.request_hold = false
  form.holdPaymentMethod = 'auto'
  form.rateKind = 'standard'
  preview.value = null
  previewError.value = null
}

function handleCloseModal() {
  closeModal()
}

function onOwnBookingClick(payload: {
  bookingId: string
  start: string
  end: string
  status?: string
  rateKind?: string
  notes?: string
  paymentExpiresAt?: string | null
}) {
  clickedBooking.value = payload
  clickedBookingNoteDraft.value = payload.notes ?? ''
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

const ownBookingIsPendingPayment = computed(() =>
  String(clickedBooking.value?.status ?? '').toLowerCase() === 'pending_payment'
)

const ownBookingCanModify = computed(() => {
  if (clickedBooking.value?.rateKind === 'standby') return false
  if (ownBookingHasPassed.value) return false
  if (ownBookingIsPendingPayment.value) return true
  if (isAdmin.value) return true
  return !ownBookingWithinNoticeWindow.value
})

const ownBookingCanCancel = computed(() => {
  if (clickedBooking.value?.rateKind === 'standby') return false
  if (ownBookingHasPassed.value) return false
  if (ownBookingIsPendingPayment.value) return true
  if (isAdmin.value) return true
  return !ownBookingWithinNoticeWindow.value
})

const ownBookingCanExtend = computed(() => {
  if (clickedBooking.value?.rateKind === 'standby') return false
  if (!clickedBooking.value?.start || !clickedBooking.value?.end) return false
  const status = String(clickedBooking.value.status ?? '').toLowerCase()
  if (!['confirmed', 'requested', 'pending_payment'].includes(status)) return false
  const startMs = new Date(clickedBooking.value.start).getTime()
  const endMs = new Date(clickedBooking.value.end).getTime()
  return Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= Date.now() && endMs > Date.now()
})

const ownBookingCanEditNote = computed(() => !ownBookingHasPassed.value)
const ownBookingNoteDirty = computed(() =>
  (clickedBookingNoteDraft.value ?? '').trim() !== (clickedBooking.value?.notes ?? '').trim()
)

const ownBookingLockReason = computed(() => {
  if (ownBookingIsPendingPayment.value) return ''
  if (clickedBooking.value?.rateKind === 'standby') {
    return 'Standby bookings are locked after purchase and cannot be canceled, rescheduled, or extended.'
  }
  if (ownBookingHasPassed.value) {
    if (ownBookingCanExtend.value) return 'This booking has already started. It can only be extended.'
    return 'This booking has already started or passed and can no longer be modified or canceled.'
  }
  if (!isAdmin.value && ownBookingWithinNoticeWindow.value) return `Members cannot modify/cancel within ${memberRescheduleNoticeHours.value} hours of start.`
  return ''
})

const ownBookingPendingExpiresLabel = computed(() => {
  const value = clickedBooking.value?.paymentExpiresAt
  if (!value) return null
  const expiresAt = new Date(value)
  if (Number.isNaN(expiresAt.getTime())) return null
  return expiresAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles'
  })
})

async function refreshSidebarMembershipCredits() {
  await Promise.allSettled([
    refreshNuxtData('dash:sidebar:membership'),
    refreshNuxtData('dash:sidebar:credits'),
    refreshNuxtData('dash:sidebar:credit-cap')
  ])
}

function closeOwnBookingActions(options?: { force?: boolean }) {
  if (ownBookingActionLoading.value && !options?.force) return
  ownBookingActionOpen.value = false
  clickedBookingNoteDraft.value = ''
  clickedBooking.value = null
}

function requestOwnBookingDestructiveAction(action: 'cancel' | 'restart') {
  if (!clickedBooking.value?.bookingId || ownBookingActionLoading.value) return
  ownBookingDestructiveAction.value = action
  ownBookingDestructiveConfirmOpen.value = true
}

function closeOwnBookingDestructiveConfirmation() {
  if (ownBookingActionLoading.value) return
  ownBookingDestructiveConfirmOpen.value = false
  ownBookingDestructiveAction.value = null
}

async function saveClickedBookingNote() {
  if (!clickedBooking.value?.bookingId) return
  if (!ownBookingCanEditNote.value) {
    toast.add({ title: 'Cannot update note', description: 'Past bookings cannot be updated.', color: 'warning' })
    return
  }
  if (!ownBookingNoteDirty.value) return
  ownBookingActionLoading.value = true
  try {
    const result = await $fetch<{ ok: boolean, notes: string | null }>(`/api/bookings/${clickedBooking.value.bookingId}/notes`, {
      method: 'PATCH',
      body: {
        notes: clickedBookingNoteDraft.value || null
      }
    })
    clickedBooking.value = {
      ...clickedBooking.value,
      notes: result.notes ?? ''
    }
    clickedBookingNoteDraft.value = result.notes ?? ''
    refreshCalendar()
    toast.add({ title: 'Booking note updated', color: 'success' })
  } catch (error: unknown) {
    const maybe = error as ApiErrorLike
    toast.add({
      title: 'Could not update note',
      description: maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error',
      color: 'error'
    })
  } finally {
    ownBookingActionLoading.value = false
  }
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
    toast.add({ title: ownBookingIsPendingPayment.value ? 'Pending reservation released' : 'Booking canceled', color: 'success' })
    closeOwnBookingActions({ force: true })
    ownBookingDestructiveConfirmOpen.value = false
    ownBookingDestructiveAction.value = null
    refreshCalendar()
    await Promise.allSettled([
      refreshCreditBalance(),
      refreshHoldSummary(),
      refreshSidebarMembershipCredits()
    ])
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
  if (ownBookingIsPendingPayment.value) {
    requestOwnBookingDestructiveAction('restart')
    return
  }
  if (!ownBookingCanModify.value) {
    toast.add({ title: 'Cannot reschedule booking', description: ownBookingLockReason.value || 'Booking is locked', color: 'warning' })
    return
  }
  await router.push(`/dashboard/bookings?reschedule=${encodeURIComponent(clickedBooking.value.bookingId)}`)
}

async function restartPendingBooking() {
  if (!clickedBooking.value?.bookingId || !ownBookingIsPendingPayment.value) return
  const target = clickedBooking.value
  const start = new Date(target.start)
  const end = new Date(target.end)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    toast.add({
      title: 'Cannot restart reservation',
      description: 'The pending reservation has an invalid time range.',
      color: 'warning'
    })
    return
  }

  ownBookingActionLoading.value = true
  try {
    await $fetch(`/api/bookings/${target.bookingId}`, { method: 'DELETE' })
    ownBookingDestructiveConfirmOpen.value = false
    ownBookingDestructiveAction.value = null
    closeOwnBookingActions({ force: true })
    refreshCalendar()
    onSelect({ start, end })
    toast.add({
      title: 'Reservation released',
      description: 'Review the same time again or close the modal and choose a different slot.',
      color: 'success'
    })
  } catch (error: unknown) {
    const maybe = error as ApiErrorLike
    toast.add({
      title: 'Could not release reservation',
      description: maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error',
      color: 'error'
    })
  } finally {
    ownBookingActionLoading.value = false
  }
}

async function confirmOwnBookingDestructiveAction() {
  if (ownBookingDestructiveAction.value === 'restart') {
    await restartPendingBooking()
    return
  }
  if (ownBookingDestructiveAction.value === 'cancel') await cancelClickedBooking()
}

async function extendClickedBooking() {
  if (!clickedBooking.value?.bookingId) return
  if (!ownBookingCanExtend.value) {
    toast.add({ title: 'Cannot extend booking', description: 'This booking can no longer be extended.', color: 'warning' })
    return
  }
  await router.push(`/dashboard/bookings?extend=${encodeURIComponent(clickedBooking.value.bookingId)}`)
}

async function confirmBooking() {
  if (!selected.value || !membershipResolved.value) return
  if (hasInsufficientCredits.value && hasActiveMembership.value) {
    toast.add({
      title: 'Insufficient credits',
      description: 'Please buy more credits before booking this slot.',
      color: 'warning'
    })
    return
  }
  confirming.value = true
  try {
    const endpoint = hasActiveMembership.value ? '/api/bookings/create' : '/api/bookings/guest'
    const res = await $fetch<BookingCreateResponse>(endpoint, {
      method: 'POST',
      body: {
        start_time: selected.value.start.toISOString(),
        end_time: selected.value.end.toISOString(),
        notes: form.notes || null,
        request_hold: hasActiveMembership.value ? form.request_hold : false,
        hold_payment_method: holdSelectionRequired.value ? form.holdPaymentMethod : 'auto',
        rate_kind: form.rateKind
      }
    })

    if (res.checkoutUrl) {
      window.location.href = res.checkoutUrl
      return
    }

    toast.add({
      title: 'Studio booked!',
      description: `${res.burned ?? preview.value?.creditsNeeded ?? 0} credits used. New balance: ${res.newBalance ?? 'updated'} credits.`,
      color: 'success'
    })
    closeModal(true)
    refreshCalendar()
    await Promise.allSettled([
      refreshCreditBalance(),
      refreshHoldSummary(),
      refreshSidebarMembershipCredits()
    ])
  } catch (error: unknown) {
    const maybe = error as ApiErrorLike
    const msg = maybe.data?.statusMessage ?? maybe.message ?? 'Booking failed'
    if (getApiErrorCode(error) === 'WAIVER_REQUIRED') {
      toast.add({
        title: 'Waiver signature required',
        description: 'Please sign the current waiver before booking.',
        color: 'warning'
      })
      await router.push(`/dashboard/waiver?returnTo=${encodeURIComponent(route.fullPath)}`)
      return
    }
    toast.add({ title: 'Could not book', description: msg, color: 'error' })
    if (isCreditError(msg)) {
      await router.push('/dashboard/credits')
      return
    }
    if (isHoldError(msg)) {
      await router.push('/dashboard/bookings?tab=holds')
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
  if (!hasActiveMembership.value) return false
  return creditBalance.value < requiredCredits.value
})

const guestShortfallCredits = computed(() =>
  Math.max(0, Number(preview.value?.shortfallCredits ?? 0))
)

const guestAmountDueCents = computed(() =>
  Math.max(0, Number(preview.value?.amountDueCents ?? 0))
)

const confirmButtonLabel = computed(() => {
  if (!preview.value) return 'Book'
  if (!hasActiveMembership.value && guestAmountDueCents.value > 0) {
    return `Pay · ${formatPrice(guestAmountDueCents.value)}`
  }
  return `Book · ${preview.value.creditsNeeded} cr`
})

watch(
  () => form.rateKind,
  () => {
    if (!selected.value) return
    form.request_hold = false
    fetchPreview(selected.value.start, selected.value.end)
  }
)

function _goToBuyCredits() {
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

function formatStandbyDiscount(value?: number | null) {
  const multiplier = Number(value ?? 0.5)
  const discount = Number.isFinite(multiplier)
    ? Math.round(Math.max(0, Math.min(1, 1 - multiplier)) * 100)
    : 50
  return `${discount}%`
}

function formatPrice(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <DashboardPageScaffold
      panel-id="book"
      title="Book Studio"
    >
      <template #right>
        <DashboardActionGroup
          :primary="{
            label: 'Create booking',
            icon: 'i-lucide-calendar-plus',
            disabled: !membershipResolved,
            onSelect: openManualBookingModal
          }"
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
      <div class="w-full space-y-4">
        <DashboardSectionState
          v-if="membershipPending"
          state="loading"
          title="Loading booking access"
          description="Checking your membership before applying member or guest booking rules."
        />
        <DashboardSectionState
          v-else-if="membershipError"
          state="error"
          title="Could not verify booking access"
          description="Your account was not switched to guest pricing. Retry before choosing a booking time."
          show-retry
          @retry="refreshMembership"
        />
        <DashboardDismissibleIntro
          v-else-if="hasActiveMembership"
          storage-key="booking-member-intro"
          color="info"
          icon="i-lucide-calendar-plus"
          :title="isManualMembership ? 'Create a booking with your assigned membership' : 'Create a studio booking'"
          description="Click and drag on the calendar, or use Create booking to choose a date and time. Your tier's booking window, peak-hour credit rate, and reschedule notice rules apply."
        >
          <template #actions>
            <UButton
              size="xs"
              icon="i-lucide-calendar-plus"
              @click="openManualBookingModal"
            >
              Create booking
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              to="/dashboard/bookings"
            >
              My bookings
            </UButton>
          </template>
        </DashboardDismissibleIntro>

        <DashboardDismissibleIntro
          v-else-if="membershipState === 'none'"
          storage-key="booking-guest-intro"
          color="warning"
          icon="i-lucide-badge-alert"
          title="Create a guest booking"
          description="Guests can book between 11am and 7pm using premium credits. Select at least 2 hours in whole-hour increments; you can confirm with existing credits or pay only the credit shortfall at checkout."
        >
          <template #actions>
            <UButton
              size="xs"
              icon="i-lucide-calendar-plus"
              @click="openManualBookingModal"
            >
              Create booking
            </UButton>
            <UButton
              color="warning"
              variant="soft"
              size="xs"
              to="/dashboard/membership"
            >
              Compare memberships
            </UButton>
          </template>
        </DashboardDismissibleIntro>

        <AppAlert
          v-else
          color="warning"
          variant="soft"
          icon="i-lucide-badge-alert"
          :title="membershipState === 'past_due'
            ? 'Membership payment is past due'
            : membershipState === 'pending_checkout'
              ? 'Membership checkout is incomplete'
              : membershipState === 'canceled'
                ? 'Membership canceled'
                : 'Membership expired'"
          :description="membershipState === 'past_due'
            ? 'Member booking benefits are paused. Until billing is restored, confirmed guest rules and pricing apply.'
            : membershipState === 'pending_checkout'
              ? 'Complete checkout to activate member booking rules. You can still use confirmed guest booking access in the meantime.'
              : 'Member booking benefits are no longer active. Confirmed guest rules and pricing apply.'"
        >
          <template #actions>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              to="/dashboard/membership"
            >
              Review membership
            </UButton>
          </template>
        </AppAlert>

        <AppAlert
          v-if="membershipResolved && creditBalance < 0"
          color="error"
          variant="soft"
          icon="i-lucide-circle-minus"
          title="Credit balance below zero"
          :description="`Your account balance is ${creditBalance} credits. Add credits before confirming a member booking.`"
        />

        <AvailabilityCalendar
          v-if="membershipResolved"
          ref="calendarRef"
          endpoint="/api/calendar/member"
          @select="onSelect"
          @booking-click="onOwnBookingClick"
        />
      </div>
    </DashboardPageScaffold>

    <ManualBookingTimeModal
      v-if="membershipResolved"
      v-model:open="manualBookingOpen"
      title="Create booking"
      description="Choose a date and time instead of dragging on the calendar."
      calendar-endpoint="/api/calendar/member"
      :start-hour="manualBookingStartHour"
      :end-hour="manualBookingEndHour"
      :increment-minutes="manualBookingIncrementMinutes"
      :min-duration-minutes="manualBookingMinDurationMinutes"
      :default-duration-minutes="manualBookingDefaultDurationMinutes"
      submit-label="Review booking"
      @submit="onManualBookingSubmit"
    />

    <!-- Booking confirmation modal -->
    <UModal
      v-model:open="open"
      title="Create booking"
      description="Review the selected studio time, credit cost, and booking options before confirming."
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
                Confirm booking
              </h3>
              <UButton
                icon="i-lucide-x"
                aria-label="Close booking review"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="confirming"
                @click="handleCloseModal"
              />
            </div>
          </template>

          <div class="space-y-4 pr-1">
            <section class="space-y-2">
              <p class="text-xs uppercase tracking-wide text-dimmed">
                Session details
              </p>
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
            </section>

            <section class="space-y-2 rounded-lg border border-default p-3">
              <p class="text-xs uppercase tracking-wide text-dimmed">
                Credits and payment
              </p>

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
                    :color="preview.rateKind === 'standby' ? 'neutral' : preview.breakdown.isPeakWindow ? 'warning' : 'success'"
                    variant="soft"
                    size="sm"
                  >
                    {{
                      preview.rateKind === 'standby'
                        ? `Standby (${formatStandbyDiscount(preview.standby?.discountMultiplier)} off)`
                        : preview.breakdown.isPeakWindow
                          ? `Peak (${formatPeakCredits(preview.peakMultiplier)} credits/hr)`
                          : 'Off-peak (1 credit/hr)'
                    }}
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
                <div
                  v-else-if="isGuestBooking"
                  class="text-xs text-dimmed"
                >
                  Guest pricing uses premium credits at {{ preview.ratePerCreditCents ? `${formatPrice(preview.ratePerCreditCents)}/credit` : 'the current guest rate' }}.
                </div>
                <div class="mt-2 flex justify-between items-center text-xs text-dimmed">
                  <span>Available now</span>
                  <span>{{ balanceLoading ? 'Loading…' : `${isGuestBooking ? (preview.remainingCredits ?? creditBalance) : creditBalance} credits` }}</span>
                </div>
                <div class="flex justify-between items-center text-xs text-dimmed">
                  <span>Required</span>
                  <span>{{ requiredCredits }} credits</span>
                </div>
                <div
                  v-if="isGuestBooking && guestShortfallCredits > 0"
                  class="flex justify-between items-center text-xs text-dimmed"
                >
                  <span>Pay today</span>
                  <span>{{ guestShortfallCredits }} cr shortfall · {{ formatPrice(guestAmountDueCents) }}</span>
                </div>
              </div>

              <UCheckbox
                v-if="preview?.standby?.eligible"
                class="mt-2"
                :model-value="form.rateKind === 'standby'"
                label="Use same-day standby rate"
                :description="`Standby applies a ${formatStandbyDiscount(preview.standby.discountMultiplier)} credit discount. Standby bookings are locked after purchase and cannot be canceled, rescheduled, extended, or held.`"
                @update:model-value="form.rateKind = $event ? 'standby' : 'standard'"
              />

              <AppAlert
                v-if="hasInsufficientCredits"
                class="mt-2"
                color="warning"
                variant="soft"
                icon="i-lucide-wallet-cards"
                title="Insufficient credits"
                :description="`This booking needs ${requiredCredits} credits, but you currently have ${creditBalance}.`"
              />

              <AppAlert
                v-if="isGuestBooking && guestShortfallCredits > 0"
                class="mt-2"
                color="info"
                variant="soft"
                icon="i-lucide-credit-card"
                title="Payment required"
                :description="`You have ${preview?.remainingCredits ?? creditBalance} credits available. Checkout will charge only the ${guestShortfallCredits} credit shortfall.`"
              />

              <AppAlert
                v-if="hasActiveMembership && !canShowHoldOption"
                class="mt-2"
                color="warning"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="holdSelectionEligibility.reasons.join(' ')"
              />
              <UCheckbox
                v-if="canShowHoldOption"
                v-model="form.request_hold"
                label="Request overnight equipment hold"
                :description="`Extends your reservation until ${DateTime.fromObject({ hour: holdEndHour, minute: 0 }, { zone: 'America/Los_Angeles' }).toFormat('h:mm a')} next day. Hold time does not count as booking hours, and door locks do not work during hold hours unless staff is contacted first.`"
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
            </section>

            <section class="space-y-2">
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
            </section>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="confirming"
                @click="handleCloseModal"
              >
                Cancel
              </UButton>
              <UButton
                :loading="confirming"
                :disabled="previewLoading || !!previewError || !preview || hasInsufficientCredits"
                @click="confirmBooking"
              >
                {{ confirmButtonLabel }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal
      v-model:open="ownBookingActionOpen"
      title="Manage booking"
      description="Review booking details and the actions currently available for this reservation."
      :dismissible="!ownBookingActionLoading"
    >
      <template #content>
        <UCard
          v-if="clickedBooking"
          class="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-h-[calc(100dvh-4rem)]"
          :ui="{ body: 'min-h-0 overflow-y-scroll' }"
        >
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h3 class="font-semibold text-base">
                {{ ownBookingIsPendingPayment ? 'Pending payment reservation' : 'Manage booking' }}
              </h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="ownBookingActionLoading"
                @click="() => closeOwnBookingActions()"
              />
            </div>
          </template>

          <div class="space-y-2 pr-1 text-sm">
            <AppAlert
              v-if="ownBookingIsPendingPayment"
              color="info"
              variant="soft"
              icon="i-lucide-clock"
              :title="ownBookingPendingExpiresLabel ? `Held until ${ownBookingPendingExpiresLabel}` : 'Payment is pending'"
              description="This slot is temporarily held while checkout is pending. Restarting releases the hold and opens this time for review again."
            />
            <AppAlert
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
              <UFormField
                class="mt-2"
                label="Booking note"
                :description="ownBookingCanEditNote ? 'Visible in your booking block on the calendar.' : 'Past bookings cannot be updated.'"
              >
                <UTextarea
                  v-model="clickedBookingNoteDraft"
                  :rows="3"
                  :maxlength="500"
                  placeholder="Add a note for this booking"
                  :disabled="ownBookingActionLoading || !ownBookingCanEditNote"
                />
              </UFormField>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                class="disabled:opacity-100"
                :loading="ownBookingActionLoading && ownBookingNoteDirty"
                :disabled="ownBookingActionLoading || !ownBookingCanEditNote || !ownBookingNoteDirty"
                @click="saveClickedBookingNote"
              >
                Save note
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                class="disabled:opacity-100"
                :disabled="ownBookingActionLoading || !ownBookingCanModify"
                @click="manageClickedBooking"
              >
                {{ ownBookingIsPendingPayment ? 'Restart / edit time' : 'Modify / reschedule' }}
              </UButton>
              <UButton
                v-if="ownBookingCanExtend"
                color="primary"
                variant="soft"
                class="disabled:opacity-100"
                :disabled="ownBookingActionLoading"
                @click="extendClickedBooking"
              >
                Extend
              </UButton>
              <UButton
                color="error"
                class="disabled:opacity-100"
                :loading="ownBookingActionLoading"
                :disabled="!ownBookingCanCancel"
                @click="requestOwnBookingDestructiveAction('cancel')"
              >
                {{ ownBookingIsPendingPayment ? 'Release reservation' : 'Cancel booking' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal
      v-model:open="ownBookingDestructiveConfirmOpen"
      :title="ownBookingDestructiveAction === 'restart' ? 'Release this reservation?' : 'Cancel this booking?'"
      description="Confirm before releasing reserved studio time."
      :dismissible="!ownBookingActionLoading"
    >
      <template #content>
        <UCard v-if="clickedBooking && ownBookingDestructiveAction">
          <template #header>
            <h3 class="text-base font-semibold">
              {{ ownBookingDestructiveAction === 'restart' ? 'Release this reservation?' : 'Cancel this booking?' }}
            </h3>
          </template>
          <div class="space-y-3 text-sm">
            <p class="text-dimmed">
              {{ ownBookingDestructiveAction === 'restart'
                ? 'Releasing the pending reservation makes this time available again before you review a replacement booking.'
                : 'This releases the studio time. The server will determine whether any credits are returned.' }}
            </p>
            <div class="rounded-lg border border-default p-3">
              {{ formatDateTime(new Date(clickedBooking.start)) }} to {{ formatDateTime(new Date(clickedBooking.end)) }}
            </div>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="ownBookingActionLoading"
                @click="closeOwnBookingDestructiveConfirmation"
              >
                Keep booking
              </UButton>
              <UButton
                color="error"
                :loading="ownBookingActionLoading"
                @click="confirmOwnBookingDestructiveAction"
              >
                {{ ownBookingDestructiveAction === 'restart' ? 'Release and review' : 'Confirm cancellation' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
