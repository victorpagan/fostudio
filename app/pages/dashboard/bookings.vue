<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { DateTime } from 'luxon'
import { normalizeDiscountLabel } from '~~/app/utils/membershipDiscount'
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'

// auth only — no membership-required middleware. We handle the no-membership
// state inline so users can purchase right from this page.
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isAdmin } = useCurrentUser()
const router = useRouter()
const route = useRoute()
const toast = useToast()

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

type Booking = {
  id: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  credits_burned: number | null
  created_at: string
  booking_holds?: {
    id: string
    hold_start: string
    hold_end: string
    hold_type: string
  }[] | null
}

type PlanOption = {
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
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

type BookingPolicy = {
  memberRescheduleNoticeHours: number
  holdCreditCost: number
  minHoldBookingHours: number
  holdMinEndHour: number
  holdEndHour: number
  peakStartHour: number
}

type HoldSummary = {
  paidHoldBalance: number
  includedHoldsRemaining: number
  canRequestHoldNow: boolean
}

type CalendarLoadEvent = {
  id?: string
  start?: string
  end?: string
  display?: string
  extendedProps?: {
    type?: 'booking' | 'hold' | 'external'
    bookingId?: string
    isOwn?: boolean
  }
}

type CalendarLoadResponse = {
  bookingWindowDays?: number
  events?: CalendarLoadEvent[]
}

const STUDIO_TZ = 'America/Los_Angeles'
const STUDIO_LOCATION_LABEL = 'FO Studio, 3131 N. San Fernando Rd., Los Angeles, CA 90065'
const PAST_BOOKINGS_PAGE_SIZE = 10
type BookingTab = 'active' | 'holds' | 'past'
type RescheduleMode = 'reschedule' | 'extend'

const nowIso = useState('dashboard:bookings:now-iso', () => new Date().toISOString())
nowIso.value = new Date().toISOString()

// Check membership status first (admins always pass)
const { data: membershipData } = await useAsyncData('bookings:membership', async () => {
  if (!user.value) return null
  const { data } = await supabase
    .from('memberships')
    .select('status, tier, cadence, current_period_end, canceled_at')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  return data
})

const hasMembership = computed(() =>
  isAdmin.value || resolveMembershipUiState(membershipData.value) === 'active'
)

// Only fetch bookings when membership is confirmed
const { data: upcoming, refresh: refreshUpcoming } = await useAsyncData('bookings:upcoming', async () => {
  if (!user.value || !hasMembership.value) return []
  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, notes, credits_burned, created_at, booking_holds(id,hold_start,hold_end,hold_type)')
    .eq('user_id', user.value.sub)
    .gt('end_time', nowIso.value)
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
    .select('id, start_time, end_time, status, notes, credits_burned, created_at, booking_holds(id,hold_start,hold_end,hold_type)')
    .eq('user_id', user.value.sub)
    .lte('end_time', nowIso.value)
    .order('start_time', { ascending: false })
    .limit(200)
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
const { data: bookingPolicy } = await useAsyncData('bookings:policy', async () => {
  return await $fetch<BookingPolicy>('/api/bookings/policy')
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
const holdMinEndLabel = computed(() =>
  DateTime.fromObject({ hour: holdMinEndHour.value, minute: 0 }, { zone: STUDIO_TZ }).toFormat('h:mm a')
)
const holdEndLabel = computed(() =>
  DateTime.fromObject({ hour: holdEndHour.value, minute: 0 }, { zone: STUDIO_TZ }).toFormat('h:mm a')
)

const { data: holdSummary, refresh: refreshHoldSummary } = await useAsyncData('bookings:hold-summary', async () => {
  if (!hasMembership.value) {
    return {
      paidHoldBalance: 0,
      includedHoldsRemaining: 0,
      canRequestHoldNow: false
    } as HoldSummary
  }
  try {
    return await $fetch<HoldSummary>('/api/holds/summary')
  } catch {
    return {
      paidHoldBalance: 0,
      includedHoldsRemaining: 0,
      canRequestHoldNow: false
    } as HoldSummary
  }
}, { watch: [hasMembership] })

function getDiscountLabel(label?: string | null) {
  return normalizeDiscountLabel(label)
}

async function refreshAll() {
  nowIso.value = new Date().toISOString()
  await Promise.allSettled([
    refreshUpcoming(),
    refreshPast(),
    refreshSidebarMembershipCredits()
  ])
}

async function refreshSidebarMembershipCredits() {
  await Promise.allSettled([
    refreshNuxtData('dash:sidebar:membership'),
    refreshNuxtData('dash:sidebar:credits'),
    refreshNuxtData('dash:sidebar:credit-cap')
  ])
}

const cancellingId = ref<string | null>(null)
const holdCancellingId = ref<string | null>(null)
const cancelConfirmOpen = ref(false)
const cancelTarget = ref<Booking | null>(null)
const reschedulingId = ref<string | null>(null)
const rescheduleOpen = ref(false)
const rescheduleMode = ref<RescheduleMode>('reschedule')
const rescheduleLockedStartTime = ref('')
const rescheduleBaseEndTime = ref('')
const rescheduleDurationMinutes = ref(0)
const rescheduleAutoSyncEnd = ref(true)
const rescheduleHintsLoading = ref(false)
const rescheduleHintsError = ref<string | null>(null)
const rescheduleHintMonth = ref<string>('')
const rescheduleMonthCursor = ref<DateTime | null>(null)
const rescheduleBookingWindowDays = ref<number>(30)
const rescheduleDayCycleIndex = ref<Record<string, number>>({})
const reschedulePreferredStartMinute = ref<number | null>(null)
const dayOccupiedMinutes = ref<Record<string, number>>({})
const dayOccupiedIntervals = ref<Record<string, Array<{ startMinute: number, endMinute: number }>>>({})
const rescheduleForm = reactive({
  bookingId: '',
  startTime: '',
  endTime: '',
  notes: '',
  requestHold: false,
  holdPaymentMethod: 'auto' as 'auto' | 'token' | 'credits'
})

const bookingsTab = ref<BookingTab>('active')
const pastPage = ref(1)
const activeHoldBookings = computed(() =>
  (upcoming.value ?? []).filter(booking => hasHold(booking))
)
const pastTotalPages = computed(() =>
  Math.max(1, Math.ceil((past.value?.length ?? 0) / PAST_BOOKINGS_PAGE_SIZE))
)
const paginatedPastBookings = computed(() => {
  const allPast = past.value ?? []
  const page = Math.min(Math.max(1, pastPage.value), pastTotalPages.value)
  const start = (page - 1) * PAST_BOOKINGS_PAGE_SIZE
  return allPast.slice(start, start + PAST_BOOKINGS_PAGE_SIZE)
})

watch(
  () => past.value?.length ?? 0,
  () => {
    if (pastPage.value > pastTotalPages.value) pastPage.value = pastTotalPages.value
  }
)

watch(bookingsTab, (tab) => {
  if (tab === 'past' && pastPage.value < 1) pastPage.value = 1
})

function goToPastPage(page: number) {
  pastPage.value = Math.min(Math.max(1, page), pastTotalPages.value)
}

async function cancelBooking(id: string): Promise<boolean> {
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
    await Promise.allSettled([
      refreshUpcoming(),
      refreshHoldSummary(),
      refreshSidebarMembershipCredits()
    ])
    if (cancelTarget.value?.id === id) {
      cancelConfirmOpen.value = false
      cancelTarget.value = null
    }
    return true
  } catch (error: unknown) {
    const maybe = error as { message?: string }
    toast.add({ title: 'Could not cancel', description: maybe?.message ?? 'Error', color: 'error' })
    return false
  } finally {
    cancellingId.value = null
  }
}

async function cancelBookingHold(id: string) {
  holdCancellingId.value = id
  try {
    const result = await $fetch<{
      ok: boolean
      holdsRemoved: number
      holdReturned: number
      eligible_for_hold_return: boolean
      hours_until_start: number | null
      message?: string
    }>(`/api/bookings/${id}/hold`, { method: 'DELETE' })

    const msg = result.holdReturned > 0
      ? `${result.holdReturned} hold token${result.holdReturned === 1 ? '' : 's'} returned.`
      : result.message ?? 'Hold removed.'

    toast.add({ title: 'Hold updated', description: msg, color: 'success' })
    await Promise.allSettled([
      refreshUpcoming(),
      refreshHoldSummary(),
      refreshSidebarMembershipCredits()
    ])
    if (cancelTarget.value?.id === id && !cancellingId.value) {
      closeCancelConfirm()
    }
  } catch (error: unknown) {
    const maybe = error as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Could not cancel hold', description: maybe.data?.statusMessage ?? maybe.message ?? 'Error', color: 'error' })
  } finally {
    holdCancellingId.value = null
  }
}

function openCancelConfirm(booking: Booking) {
  cancelTarget.value = booking
  cancelConfirmOpen.value = true
}

function closeCancelConfirm() {
  if (cancellingId.value || holdCancellingId.value) return
  cancelConfirmOpen.value = false
  cancelTarget.value = null
}

async function confirmCancel() {
  if (!cancelTarget.value) return
  await cancelBooking(cancelTarget.value.id)
}

function toLocalInputValue(value: string | null | undefined) {
  if (!value) return ''
  const parsedIso = DateTime.fromISO(value, { setZone: true })
  if (parsedIso.isValid) return parsedIso.setZone(STUDIO_TZ).toFormat('yyyy-LL-dd\'T\'HH:mm')
  const parsedSql = DateTime.fromSQL(value, { zone: 'utc' })
  if (parsedSql.isValid) return parsedSql.setZone(STUDIO_TZ).toFormat('yyyy-LL-dd\'T\'HH:mm')
  return ''
}

function localInputToDateTime(value: string | null | undefined) {
  if (!value) return null
  const parsed = DateTime.fromFormat(value, 'yyyy-LL-dd\'T\'HH:mm', { zone: STUDIO_TZ })
  if (parsed.isValid) return parsed
  const fallback = DateTime.fromISO(value, { zone: STUDIO_TZ })
  return fallback.isValid ? fallback : null
}

function fromLocalInputValue(value: string) {
  if (!value.trim()) return null
  const dt = DateTime.fromFormat(value, 'yyyy-LL-dd\'T\'HH:mm', { zone: STUDIO_TZ })
  if (!dt.isValid) return null
  return dt.toUTC().toISO()
}

function formatRange(start: string, end: string) {
  const parse = (value: string) => {
    const iso = DateTime.fromISO(value, { setZone: true })
    if (iso.isValid) return iso.setZone('America/Los_Angeles')
    const sql = DateTime.fromSQL(value, { zone: 'utc' })
    if (sql.isValid) return sql.setZone('America/Los_Angeles')
    return null
  }

  const s = parse(start)
  const e = parse(end)
  if (!s || !e) {
    return { dateStr: `${start} to ${end}`, timeStr: '' }
  }

  const dateStr = s.toFormat('ccc, LLL d, yyyy')
  const startTime = s.toFormat('h:mm a')
  const endTime = e.toFormat('h:mm a')
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

function toGoogleCalendarDate(value: string) {
  const dt = DateTime.fromISO(value, { setZone: true })
  if (!dt.isValid) return null
  return dt.toUTC().toFormat('yyyyLLdd\'T\'HHmmss\'Z\'')
}

function openGoogleCalendarExport(booking: Booking) {
  const start = toGoogleCalendarDate(booking.start_time)
  const end = toGoogleCalendarDate(booking.end_time)
  if (!start || !end) {
    toast.add({
      title: 'Could not export booking',
      description: 'Booking time could not be parsed for Google Calendar.',
      color: 'error'
    })
    return
  }

  const details = [
    'Booked via FO Studio dashboard.',
    `Status: ${String(booking.status ?? 'confirmed')}`,
    `Booking ID: ${booking.id}`,
    booking.notes ? `Notes: ${booking.notes}` : null
  ]
    .filter(Boolean)
    .join('\n')

  const title = String(booking.status ?? '').toLowerCase() === 'canceled'
    ? 'FO Studio Booking (Canceled)'
    : 'FO Studio Booking'

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details,
    location: STUDIO_LOCATION_LABEL
  })

  const url = `https://calendar.google.com/calendar/render?${params.toString()}`
  if (import.meta.client) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function openIcalExport(booking: Booking) {
  if (!import.meta.client) return
  const href = `/api/bookings/${encodeURIComponent(booking.id)}/ical`
  window.open(href, '_blank', 'noopener,noreferrer')
}

function bookingExportItems(booking: Booking): DropdownMenuItem[][] {
  return [[
    {
      label: 'Google Calendar',
      icon: 'i-lucide-calendar-days',
      onSelect: (event: Event) => {
        event.preventDefault()
        openGoogleCalendarExport(booking)
      }
    },
    {
      label: 'Download iCal (.ics)',
      icon: 'i-lucide-download',
      onSelect: (event: Event) => {
        event.preventDefault()
        openIcalExport(booking)
      }
    }
  ]]
}

function hoursUntilStart(booking: Booking) {
  return (new Date(booking.start_time).getTime() - new Date(nowIso.value).getTime()) / 3600000
}

function hoursUntilEnd(booking: Booking) {
  return (new Date(booking.end_time).getTime() - new Date(nowIso.value).getTime()) / 3600000
}

function hasPassed(booking: Booking) {
  return hoursUntilStart(booking) <= 0
}

function hasEnded(booking: Booking) {
  return hoursUntilEnd(booking) <= 0
}

function canCancel(booking: Booking) {
  const status = String(booking.status ?? '').toLowerCase()
  if (!['confirmed', 'requested', 'pending_payment'].includes(status)) return false
  return hoursUntilStart(booking) >= 24
}

function hasHold(booking: Booking) {
  return (booking.booking_holds?.length ?? 0) > 0
}

function canCancelHoldOnly(booking: Booking) {
  const status = String(booking.status ?? '').toLowerCase()
  if (!['confirmed', 'requested', 'pending_payment'].includes(status)) return false
  if (!hasHold(booking)) return false
  return !hasPassed(booking)
}

function holdRangeLabel(booking: Booking) {
  const hold = booking.booking_holds?.[0]
  if (!hold) return null
  return formatRange(hold.hold_start, hold.hold_end)
}

function isRefundEligible(booking: Booking) {
  return hoursUntilStart(booking) >= 24
}

function canReschedule(booking: Booking) {
  if (!['confirmed', 'requested', 'pending_payment'].includes(String(booking.status ?? '').toLowerCase())) return false
  return hoursUntilStart(booking) >= memberRescheduleNoticeHours.value
}

function canExtend(booking: Booking) {
  if (!['confirmed', 'requested', 'pending_payment'].includes(String(booking.status ?? '').toLowerCase())) return false
  return hasPassed(booking) && !hasEnded(booking)
}

function rescheduleLockReason(booking: Booking) {
  if (hasPassed(booking)) {
    if (!hasEnded(booking) && canExtend(booking)) return 'This booking has already started. It can only be extended'
    return 'Reschedule unavailable: booking has already started/passed.'
  }
  return `Reschedule locked within ${memberRescheduleNoticeHours.value}h of start.`
}

function extendLockReason(booking: Booking) {
  const status = String(booking.status ?? '').toLowerCase()
  if (!['confirmed', 'requested', 'pending_payment'].includes(status)) {
    return `Extension unavailable for booking status "${booking.status}".`
  }
  if (!hasPassed(booking)) return 'Extension becomes available once your booking has started.'
  if (hasEnded(booking)) return 'Extension unavailable: booking has already ended.'
  return 'Extension unavailable.'
}

function cancelLockReason(booking: Booking) {
  if (hasPassed(booking)) return 'Cancel unavailable: booking has already started/passed.'
  return 'Cancel unavailable within 24h of booking start.'
}

function openReschedule(booking: Booking, mode: RescheduleMode = 'reschedule') {
  rescheduleMode.value = mode
  rescheduleForm.bookingId = booking.id
  const startTime = toLocalInputValue(booking.start_time)
  const endTime = toLocalInputValue(booking.end_time)
  rescheduleLockedStartTime.value = startTime
  rescheduleBaseEndTime.value = endTime
  rescheduleForm.startTime = startTime
  rescheduleForm.endTime = endTime
  rescheduleForm.notes = booking.notes ?? ''
  rescheduleForm.requestHold = hasHold(booking)
  rescheduleForm.holdPaymentMethod = 'auto'
  const startMs = new Date(booking.start_time).getTime()
  const endMs = new Date(booking.end_time).getTime()
  const duration = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 60000)) : 0
  rescheduleDurationMinutes.value = duration > 0 ? duration : 60
  const startDt = DateTime.fromISO(booking.start_time, { setZone: true }).setZone(STUDIO_TZ)
  reschedulePreferredStartMinute.value = startDt.isValid ? (startDt.hour * 60 + startDt.minute) : null
  rescheduleAutoSyncEnd.value = mode === 'reschedule'
  if (mode === 'extend') {
    const proposedEnd = DateTime.fromISO(booking.end_time, { setZone: true })
      .setZone(STUDIO_TZ)
      .plus({ minutes: 30 })
    if (proposedEnd.isValid) {
      rescheduleForm.endTime = proposedEnd.toFormat('yyyy-LL-dd\'T\'HH:mm')
    }
  }
  rescheduleDayCycleIndex.value = {}
  const cursor = localInputToDateTime(rescheduleForm.startTime)?.setZone(STUDIO_TZ) ?? DateTime.now().setZone(STUDIO_TZ)
  rescheduleMonthCursor.value = cursor.startOf('month')
  void loadRescheduleMonthHints(rescheduleForm.startTime)
  rescheduleOpen.value = true
}

function openExtension(booking: Booking) {
  if (!canExtend(booking)) return
  openReschedule(booking, 'extend')
}

function resetRescheduleState() {
  rescheduleOpen.value = false
  rescheduleMode.value = 'reschedule'
  rescheduleLockedStartTime.value = ''
  rescheduleBaseEndTime.value = ''
  rescheduleForm.bookingId = ''
  rescheduleForm.startTime = ''
  rescheduleForm.endTime = ''
  rescheduleForm.notes = ''
  rescheduleForm.requestHold = false
  rescheduleForm.holdPaymentMethod = 'auto'
  rescheduleDurationMinutes.value = 0
  rescheduleAutoSyncEnd.value = true
  rescheduleHintsLoading.value = false
  rescheduleHintsError.value = null
  rescheduleHintMonth.value = ''
  rescheduleMonthCursor.value = null
  rescheduleBookingWindowDays.value = 30
  rescheduleDayCycleIndex.value = {}
  reschedulePreferredStartMinute.value = null
  dayOccupiedMinutes.value = {}
  dayOccupiedIntervals.value = {}
}

function closeReschedule() {
  if (reschedulingId.value) return
  resetRescheduleState()
}

function forceCloseReschedule() {
  resetRescheduleState()
}

async function clearRescheduleQuery() {
  if (!route.query.reschedule && !route.query.extend) return
  const nextQuery = { ...route.query }
  delete nextQuery.reschedule
  delete nextQuery.extend
  await router.replace({ query: nextQuery })
}

async function openRescheduleFromQuery() {
  const extendRaw = route.query.extend
  const extendBookingId = typeof extendRaw === 'string' ? extendRaw : Array.isArray(extendRaw) ? extendRaw[0] : null
  const rescheduleRaw = route.query.reschedule
  const rescheduleBookingId = typeof rescheduleRaw === 'string' ? rescheduleRaw : Array.isArray(rescheduleRaw) ? rescheduleRaw[0] : null
  const mode: RescheduleMode = extendBookingId ? 'extend' : 'reschedule'
  const bookingId = extendBookingId ?? rescheduleBookingId
  if (!bookingId) return
  const target = (upcoming.value ?? []).find(booking => booking.id === bookingId)
  if (!target) return
  const isAllowed = mode === 'extend' ? canExtend(target) : canReschedule(target)
  if (!isAllowed) {
    toast.add({
      title: mode === 'extend' ? 'Cannot extend this booking' : 'Cannot reschedule this booking',
      description: mode === 'extend' ? extendLockReason(target) : rescheduleLockReason(target),
      color: 'warning'
    })
    await clearRescheduleQuery()
    return
  }
  openReschedule(target, mode)
  await clearRescheduleQuery()
}

async function saveReschedule() {
  if (!rescheduleForm.bookingId) return
  reschedulingId.value = rescheduleForm.bookingId
  try {
    const mode = rescheduleMode.value
    const lockedStart = mode === 'extend' ? fromLocalInputValue(rescheduleLockedStartTime.value) : null
    const start = mode === 'extend'
      ? lockedStart
      : fromLocalInputValue(rescheduleForm.startTime)
    const end = fromLocalInputValue(rescheduleForm.endTime)
    if (!start || !end) throw new Error('Start and end time are required')
    if (mode !== 'extend' && new Date(start).getTime() < Date.now()) throw new Error('Cannot reschedule into the past')
    const startDt = localInputToDateTime(rescheduleForm.startTime)
    const endDt = localInputToDateTime(rescheduleForm.endTime)
    if (mode === 'extend') {
      const currentEnd = localInputToDateTime(rescheduleBaseEndTime.value)
      if (!currentEnd || !endDt || endDt <= currentEnd) {
        throw new Error('Extension end time must be after your current booking end time.')
      }
    }
    if (startDt && endDt && shouldAccountForHold.value) {
      const duration = endDt.diff(startDt, 'hours').hours
      if (duration < minHoldBookingHours.value) {
        throw new Error(`Overnight holds require a minimum booking length of ${minHoldBookingHours.value} hours.`)
      }
    }

    const result = await $fetch<{
      creditDelta?: number
      oldCreditsBurned?: number
      newCreditsBurned?: number
    }>(`/api/bookings/${rescheduleForm.bookingId}/reschedule`, {
      method: 'POST',
      body: {
        start_time: start,
        end_time: end,
        notes: rescheduleForm.notes || null,
        request_hold: rescheduleForm.requestHold,
        hold_payment_method: rescheduleForm.holdPaymentMethod,
        operation: mode
      }
    })
    const delta = Number(result?.creditDelta ?? 0)
    const changeDescription = delta > 0
      ? `Charged ${delta} additional credit${delta === 1 ? '' : 's'} for the longer session.`
      : delta < 0
        ? `Refunded ${Math.abs(delta)} credit${Math.abs(delta) === 1 ? '' : 's'} from the shorter session.`
        : undefined
    const actionTitle = mode === 'extend' ? 'Booking extended' : 'Booking rescheduled'
    toast.add({ title: actionTitle, description: changeDescription, color: 'success' })
    forceCloseReschedule()
    await clearRescheduleQuery()
    const refreshResults = await Promise.allSettled([
      refreshUpcoming(),
      refreshPast(),
      refreshHoldSummary(),
      refreshSidebarMembershipCredits()
    ])
    if (refreshResults.some(result => result.status === 'rejected')) {
      toast.add({
        title: mode === 'extend' ? 'Booking was extended' : 'Booking was rescheduled',
        description: 'Could not fully refresh the page data. Please refresh once.',
        color: 'warning'
      })
    }
  } catch (error: unknown) {
    const maybe = error as ApiErrorLike
    if (getApiErrorCode(error) === 'WAIVER_REQUIRED') {
      toast.add({
        title: 'Waiver signature required',
        description: 'Please sign the current waiver before updating this booking.',
        color: 'warning'
      })
      await router.push(`/dashboard/waiver?returnTo=${encodeURIComponent(route.fullPath)}`)
      return
    }
    toast.add({
      title: rescheduleMode.value === 'extend' ? 'Could not extend booking' : 'Could not reschedule',
      description: maybe.data?.statusMessage ?? maybe.message ?? 'Error',
      color: 'error'
    })
  } finally {
    reschedulingId.value = null
  }
}

const rescheduleTarget = computed(() =>
  (upcoming.value ?? []).find(booking => booking.id === rescheduleForm.bookingId) ?? null
)

const rescheduleTargetHasHold = computed(() => Boolean(rescheduleTarget.value && hasHold(rescheduleTarget.value)))
const shouldAccountForHold = computed(() => rescheduleForm.requestHold)

function holdEligibilityFromLocalInputs(startValue: string, endValue: string) {
  const start = localInputToDateTime(startValue)?.setZone(STUDIO_TZ)
  const end = localInputToDateTime(endValue)?.setZone(STUDIO_TZ)
  if (!start || !end || !start.isValid || !end.isValid || end <= start) {
    return { eligible: false, reasons: ['Select a valid start and end time to check hold eligibility.'] }
  }
  const reasons: string[] = []
  const durationHours = end.diff(start, 'hours').hours
  if (durationHours < minHoldBookingHours.value) {
    reasons.push(`Equipment hold eligibility requires a booking of at least ${minHoldBookingHours.value} hours.`)
  }
  const requiredEnd = end.startOf('day').set({ hour: holdMinEndHour.value, minute: 0, second: 0, millisecond: 0 })
  if (end < requiredEnd) {
    const label = DateTime.fromObject({ hour: holdMinEndHour.value, minute: 0 }, { zone: STUDIO_TZ }).toFormat('h:mm a')
    reasons.push(`Equipment hold eligibility requires the booking to end at or after ${label}.`)
  }
  return {
    eligible: reasons.length === 0,
    reasons
  }
}

const rescheduleHoldEligibility = computed(() =>
  holdEligibilityFromLocalInputs(rescheduleForm.startTime, rescheduleForm.endTime)
)
const canShowRescheduleHoldOption = computed(() => rescheduleHoldEligibility.value.eligible)

const holdSelectionRequired = computed(() =>
  rescheduleForm.requestHold
  && Number(holdSummary.value?.includedHoldsRemaining ?? 0) <= 0
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
    rescheduleForm.holdPaymentMethod = 'auto'
    return
  }
  const first = holdPaymentOptions.value[0]?.value
  rescheduleForm.holdPaymentMethod = first ?? 'auto'
})

watch(canShowRescheduleHoldOption, (allowed) => {
  if (!allowed) {
    rescheduleForm.requestHold = false
    rescheduleForm.holdPaymentMethod = 'auto'
  }
})

function normalizeLocalInputValue(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const raw = (value as Record<string, unknown>).value
    return typeof raw === 'string' ? raw : String(raw ?? '')
  }
  if (value === null || value === undefined) return ''
  return String(value)
}

function onRescheduleStartChange(value: unknown) {
  const next = normalizeLocalInputValue(value)
  rescheduleForm.startTime = next

  const nextStart = localInputToDateTime(next)?.setZone(STUDIO_TZ)
  if (rescheduleAutoSyncEnd.value && nextStart) {
    const alignedEnd = nextStart.plus({ minutes: rescheduleDurationMinutes.value > 0 ? rescheduleDurationMinutes.value : 60 })
    rescheduleForm.endTime = alignedEnd.toFormat('yyyy-LL-dd\'T\'HH:mm')
  }

  if (nextStart) {
    const monthCursor = nextStart.startOf('month')
    if (!rescheduleMonthCursor.value || !rescheduleMonthCursor.value.hasSame(monthCursor, 'month')) {
      rescheduleMonthCursor.value = monthCursor
    }
  }

  void loadRescheduleMonthHints(next)
}

function setRescheduleStartFromOption(value: unknown) {
  onRescheduleStartChange(value)
}

function onRescheduleStartSelectChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  setRescheduleStartFromOption(target?.value ?? '')
}

function onRescheduleEndChange(value: unknown) {
  const next = normalizeLocalInputValue(value)
  rescheduleForm.endTime = next
  const start = localInputToDateTime(rescheduleForm.startTime)
  const end = localInputToDateTime(next)
  if (start && end && end > start) {
    rescheduleDurationMinutes.value = Math.max(1, Math.round(end.diff(start, 'minutes').minutes))
    rescheduleAutoSyncEnd.value = false
  }
}

function onRescheduleEndSelectChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  onRescheduleEndChange(target?.value ?? '')
}

function toDayKey(dt: DateTime) {
  return dt.toFormat('yyyy-LL-dd')
}

function dayKeyToDateTime(key: string) {
  const parsed = DateTime.fromFormat(key, 'yyyy-LL-dd', { zone: STUDIO_TZ })
  return parsed.isValid ? parsed : null
}

function mergeIntervals(intervals: Array<{ startMinute: number, endMinute: number }>) {
  if (!intervals.length) return []
  const ordered = [...intervals].sort((a, b) => a.startMinute - b.startMinute)
  const first = ordered[0]
  if (!first) return []
  const merged: Array<{ startMinute: number, endMinute: number }> = [{ ...first }]
  for (let i = 1; i < ordered.length; i++) {
    const last = merged[merged.length - 1]
    const current = ordered[i]
    if (!last || !current) continue
    if (current.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, current.endMinute)
      continue
    }
    merged.push({ ...current })
  }
  return merged
}

function getTargetHoldSegmentForDay(key: string) {
  const targetHold = rescheduleTarget.value?.booking_holds?.[0] ?? null
  if (!targetHold) return null
  const holdStart = DateTime.fromISO(targetHold.hold_start, { setZone: true }).setZone(STUDIO_TZ)
  const holdEnd = DateTime.fromISO(targetHold.hold_end, { setZone: true }).setZone(STUDIO_TZ)
  if (!holdStart.isValid || !holdEnd.isValid || holdEnd <= holdStart) return null

  const dayStart = dayKeyToDateTime(key)
  if (!dayStart) return null
  const dayEnd = dayStart.plus({ days: 1 })

  const segmentStart = holdStart > dayStart ? holdStart : dayStart
  const segmentEnd = holdEnd < dayEnd ? holdEnd : dayEnd
  if (segmentEnd <= segmentStart) return null

  const startMinute = Math.max(0, Math.round(segmentStart.diff(dayStart, 'minutes').minutes))
  const endMinute = Math.min(24 * 60, Math.round(segmentEnd.diff(dayStart, 'minutes').minutes))
  if (endMinute <= startMinute) return null

  return { startMinute, endMinute }
}

function subtractInterval(
  intervals: Array<{ startMinute: number, endMinute: number }>,
  removal: { startMinute: number, endMinute: number }
) {
  if (!intervals.length) return []
  if (removal.endMinute <= removal.startMinute) return [...intervals]

  const clipped: Array<{ startMinute: number, endMinute: number }> = []
  for (const interval of intervals) {
    if (removal.endMinute <= interval.startMinute || removal.startMinute >= interval.endMinute) {
      clipped.push(interval)
      continue
    }

    if (interval.startMinute < removal.startMinute) {
      clipped.push({
        startMinute: interval.startMinute,
        endMinute: Math.max(interval.startMinute, removal.startMinute)
      })
    }

    if (interval.endMinute > removal.endMinute) {
      clipped.push({
        startMinute: Math.min(interval.endMinute, removal.endMinute),
        endMinute: interval.endMinute
      })
    }
  }

  return clipped.filter(interval => interval.endMinute > interval.startMinute)
}

function getEditableIntervalsForDay(key: string) {
  let intervals = [...(dayOccupiedIntervals.value[key] ?? [])]
  const ownHoldSegment = getTargetHoldSegmentForDay(key)
  if (ownHoldSegment) {
    intervals = subtractInterval(intervals, ownHoldSegment)
  }
  return mergeIntervals(intervals)
}

function getOpenWindowsFromIntervals(intervals: Array<{ startMinute: number, endMinute: number }>) {
  if (!intervals.length) {
    return [{ startMinute: 0, endMinute: 24 * 60 }]
  }
  const windows: Array<{ startMinute: number, endMinute: number }> = []
  let cursor = 0
  for (const interval of intervals) {
    if (interval.startMinute > cursor) {
      windows.push({ startMinute: cursor, endMinute: interval.startMinute })
    }
    cursor = Math.max(cursor, interval.endMinute)
  }
  if (cursor < 24 * 60) {
    windows.push({ startMinute: cursor, endMinute: 24 * 60 })
  }
  return windows.filter(window => (window.endMinute - window.startMinute) >= 30)
}

function getOpenWindowsForDay(key: string) {
  return getOpenWindowsFromIntervals(getEditableIntervalsForDay(key))
}

function minuteToAligned30(minute: number) {
  return Math.ceil(minute / 30) * 30
}

function possibleStartMinutesForDay(key: string) {
  const windows = getOpenWindowsForDay(key)
  const duration = Math.max(1, rescheduleDurationMinutes.value || 60)
  const day = dayKeyToDateTime(key)
  const nowLa = DateTime.now().setZone(STUDIO_TZ)
  const nowMinute = day && day.hasSame(nowLa, 'day')
    ? (nowLa.hour * 60 + nowLa.minute)
    : 0

  const starts: number[] = []
  for (const window of windows) {
    const minStart = Math.max(window.startMinute, nowMinute)
    const maxStart = window.endMinute - duration
    if (maxStart < minStart) continue

    let slot = minuteToAligned30(minStart)
    if (slot > maxStart && minStart <= maxStart) {
      slot = minStart
    }
    while (slot <= maxStart) {
      starts.push(slot)
      slot += 30
    }

    const fallback = maxStart
    if (fallback >= minStart && !starts.includes(fallback)) starts.push(fallback)
  }

  const unique = Array.from(new Set(starts)).sort((a, b) => a - b)
  if (!shouldAccountForHold.value) return unique
  return unique.filter(minute => canFitHoldWindowForStart(key, minute, duration))
}

function toLocalInputForDayMinute(key: string, minute: number) {
  const day = dayKeyToDateTime(key)
  if (!day) return ''
  return day.plus({ minutes: minute }).toFormat('yyyy-LL-dd\'T\'HH:mm')
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB
}

function computeHoldEndFromBookingEnd(bookingEnd: DateTime) {
  const nextDay = bookingEnd.plus({ days: 1 }).startOf('day')
  return nextDay.set({ hour: holdEndHour.value, minute: 0, second: 0, millisecond: 0 })
}

function canFitHoldWindowForStart(dayKey: string, startMinute: number, durationMinutes: number) {
  const day = dayKeyToDateTime(dayKey)
  if (!day) return false
  const bookingStart = day.plus({ minutes: startMinute })
  const bookingEnd = bookingStart.plus({ minutes: durationMinutes })
  const holdStart = bookingEnd
  const holdEnd = computeHoldEndFromBookingEnd(bookingEnd)
  if (!(holdEnd > holdStart)) return false

  let cursor = holdStart
  while (cursor < holdEnd) {
    const currentDay = cursor.startOf('day')
    const dayEnd = currentDay.plus({ days: 1 })
    const segmentEnd = holdEnd < dayEnd ? holdEnd : dayEnd
    const key = toDayKey(currentDay)
    const segmentStartMinute = Math.max(0, Math.round(cursor.diff(currentDay, 'minutes').minutes))
    const segmentEndMinute = Math.min(24 * 60, Math.round(segmentEnd.diff(currentDay, 'minutes').minutes))
    const intervals = dayOccupiedIntervals.value[key] ?? []
    if (intervals.some(interval => rangesOverlap(segmentStartMinute, segmentEndMinute, interval.startMinute, interval.endMinute))) {
      return false
    }
    cursor = segmentEnd
  }

  return true
}

async function loadRescheduleMonthHints(anchorValue: string) {
  const anchor = localInputToDateTime(anchorValue)?.setZone(STUDIO_TZ)
    ?? DateTime.now().setZone(STUDIO_TZ)
  const monthStart = (rescheduleMonthCursor.value ?? anchor.startOf('month')).setZone(STUDIO_TZ).startOf('month')
  const monthKey = monthStart.toFormat('yyyy-LL')
  if (rescheduleHintMonth.value === monthKey && Object.keys(dayOccupiedMinutes.value).length > 0) return

  rescheduleHintsLoading.value = true
  rescheduleHintsError.value = null

  try {
    const monthEndExclusive = monthStart.plus({ months: 1 })
    const res = await $fetch<CalendarLoadResponse>('/api/calendar/member', {
      query: {
        from: monthStart.toUTC().toISO(),
        to: monthEndExclusive.toUTC().toISO()
      }
    })
    rescheduleBookingWindowDays.value = Math.max(1, Number(res.bookingWindowDays ?? rescheduleBookingWindowDays.value ?? 30))
    const targetBookingId = rescheduleForm.bookingId || null
    const targetHold = rescheduleTarget.value?.booking_holds?.[0] ?? null
    const targetHoldStartMs = targetHold ? new Date(targetHold.hold_start).getTime() : Number.NaN
    const targetHoldEndMs = targetHold ? new Date(targetHold.hold_end).getTime() : Number.NaN
    const targetHoldSegmentsByDay: Record<string, { startMinute: number, endMinute: number }> = {}
    if (Number.isFinite(targetHoldStartMs) && Number.isFinite(targetHoldEndMs) && targetHoldEndMs > targetHoldStartMs) {
      let holdCursor = DateTime.fromMillis(targetHoldStartMs, { zone: 'utc' }).setZone(STUDIO_TZ)
      const holdEnd = DateTime.fromMillis(targetHoldEndMs, { zone: 'utc' }).setZone(STUDIO_TZ)
      while (holdCursor < holdEnd) {
        const dayStart = holdCursor.startOf('day')
        const dayEnd = dayStart.plus({ days: 1 })
        const segmentEnd = holdEnd < dayEnd ? holdEnd : dayEnd
        const key = toDayKey(dayStart)
        const startMinute = Math.max(0, Math.round(holdCursor.diff(dayStart, 'minutes').minutes))
        const endMinute = Math.min(24 * 60, Math.round(segmentEnd.diff(dayStart, 'minutes').minutes))
        if (endMinute > startMinute) {
          targetHoldSegmentsByDay[key] = { startMinute, endMinute }
        }
        holdCursor = segmentEnd
      }
    }

    const intervalsByDay: Record<string, Array<{ startMinute: number, endMinute: number }>> = {}
    for (const rawEvent of (res.events ?? [])) {
      if (rawEvent.extendedProps?.bookingId && targetBookingId && rawEvent.extendedProps.bookingId === targetBookingId) {
        continue
      }
      const type = rawEvent.extendedProps?.type
      if (type === 'hold' && rawEvent.extendedProps?.isOwn) {
        continue
      }
      const isOccupied = type === 'booking' || type === 'hold' || type === 'external' || rawEvent.display === 'background'
      if (!isOccupied) continue
      if (!rawEvent.start || !rawEvent.end) continue

      let start = DateTime.fromISO(rawEvent.start, { setZone: true }).setZone(STUDIO_TZ)
      const end = DateTime.fromISO(rawEvent.end, { setZone: true }).setZone(STUDIO_TZ)
      if (!start.isValid || !end.isValid || end <= start) continue
      if (type === 'hold' && Number.isFinite(targetHoldStartMs) && Number.isFinite(targetHoldEndMs)) {
        const eventStartMs = start.toUTC().toMillis()
        const eventEndMs = end.toUTC().toMillis()
        if (eventStartMs === targetHoldStartMs && eventEndMs === targetHoldEndMs) {
          continue
        }
      }

      while (start < end) {
        const dayStart = start.startOf('day')
        const dayEnd = dayStart.plus({ days: 1 })
        const segmentEnd = end < dayEnd ? end : dayEnd
        const key = toDayKey(dayStart)
        const startMinute = Math.max(0, Math.round(start.diff(dayStart, 'minutes').minutes))
        const endMinute = Math.min(24 * 60, Math.round(segmentEnd.diff(dayStart, 'minutes').minutes))
        if (endMinute > startMinute) {
          if (!intervalsByDay[key]) intervalsByDay[key] = []
          intervalsByDay[key].push({ startMinute, endMinute })
        }
        start = segmentEnd
      }
    }

    const occupiedMinutesByDay: Record<string, number> = {}
    const mergedByDay: Record<string, Array<{ startMinute: number, endMinute: number }>> = {}
    for (const [key, intervals] of Object.entries(intervalsByDay)) {
      let merged = mergeIntervals(intervals)
      const ownHoldSegment = targetHoldSegmentsByDay[key]
      if (ownHoldSegment) {
        merged = subtractInterval(merged, ownHoldSegment)
      }
      mergedByDay[key] = merged
      occupiedMinutesByDay[key] = merged.reduce((sum, segment) => sum + Math.max(0, segment.endMinute - segment.startMinute), 0)
    }

    dayOccupiedIntervals.value = mergedByDay
    dayOccupiedMinutes.value = occupiedMinutesByDay
    rescheduleHintMonth.value = monthKey
  } catch (error: unknown) {
    const maybe = error as { data?: { statusMessage?: string }, message?: string }
    rescheduleHintsError.value = maybe.data?.statusMessage ?? maybe.message ?? 'Could not load monthly load hints'
  } finally {
    rescheduleHintsLoading.value = false
  }
}

const selectedRescheduleDay = computed(() => {
  const start = localInputToDateTime(rescheduleForm.startTime)?.setZone(STUDIO_TZ)
  return start ? toDayKey(start) : null
})

function formatMinuteOfDay(minute: number) {
  const clamped = Math.max(0, Math.min(24 * 60, minute))
  const hour = Math.floor(clamped / 60)
  const minutes = clamped % 60
  const dt = DateTime.fromObject({ year: 2000, month: 1, day: 1, hour, minute: minutes })
  return dt.toFormat('h:mm a')
}

const selectedDayWindows = computed(() => {
  const key = selectedRescheduleDay.value
  if (!key) return []
  return getOpenWindowsForDay(key)
})

const selectedDayFitWindows = computed(() => {
  const duration = Math.max(1, rescheduleDurationMinutes.value || 60)
  return selectedDayWindows.value.filter(window => (window.endMinute - window.startMinute) >= duration)
})

const selectedDayStartOptions = computed(() => {
  const key = selectedRescheduleDay.value
  if (!key) return [] as Array<{ label: string, value: string }>
  const starts = possibleStartMinutesForDay(key)
  return starts
    .map((minute) => {
      const value = toLocalInputForDayMinute(key, minute)
      if (!value) return null
      const labelDate = DateTime.fromFormat(value, 'yyyy-LL-dd\'T\'HH:mm')
      return {
        value,
        label: labelDate.isValid ? labelDate.toFormat('EEE, LLL d · h:mm a') : value
      }
    })
    .filter((option): option is { label: string, value: string } => Boolean(option))
})

const selectedStartMinute = computed(() => {
  const start = localInputToDateTime(rescheduleForm.startTime)?.setZone(STUDIO_TZ)
  if (!start || !start.isValid) return null
  return start.hour * 60 + start.minute
})

const selectedDayEndOptions = computed(() => {
  const buildOptions = (params: {
    key: string
    fromMinute: number
    toMinute: number
    minExclusive?: number | null
  }) => {
    if (params.toMinute <= params.fromMinute) return [] as Array<{ label: string, value: string }>

    const values: number[] = []
    let minute = minuteToAligned30(params.fromMinute + 30)
    while (minute <= params.toMinute) {
      values.push(minute)
      minute += 30
    }
    if (!values.includes(params.toMinute)) {
      values.push(params.toMinute)
    }

    return Array.from(new Set(values))
      .sort((a, b) => a - b)
      .filter(endMinute => params.minExclusive == null || endMinute > params.minExclusive)
      .map((endMinute) => {
        const value = toLocalInputForDayMinute(params.key, endMinute)
        if (!value) return null
        const labelDate = DateTime.fromFormat(value, 'yyyy-LL-dd\'T\'HH:mm', { zone: STUDIO_TZ })
        return {
          value,
          label: labelDate.isValid ? labelDate.toFormat('EEE, LLL d · h:mm a') : value
        }
      })
      .filter((option): option is { label: string, value: string } => Boolean(option))
  }

  if (rescheduleMode.value === 'extend') {
    const baseEnd = localInputToDateTime(rescheduleBaseEndTime.value)?.setZone(STUDIO_TZ)
    if (!baseEnd || !baseEnd.isValid) return [] as Array<{ label: string, value: string }>
    const key = toDayKey(baseEnd)
    const baseEndMinute = baseEnd.hour * 60 + baseEnd.minute
    const intervals = getEditableIntervalsForDay(key)
    const nextOccupiedStart = intervals.find(interval => interval.startMinute >= baseEndMinute)?.startMinute ?? (24 * 60)
    return buildOptions({
      key,
      fromMinute: baseEndMinute,
      toMinute: nextOccupiedStart,
      minExclusive: baseEndMinute
    })
  }

  const key = selectedRescheduleDay.value
  const startMinute = selectedStartMinute.value
  if (!key || startMinute === null) return [] as Array<{ label: string, value: string }>

  const intervals = getEditableIntervalsForDay(key)
  const containingWindow = getOpenWindowsFromIntervals(intervals).find(window =>
    startMinute >= window.startMinute && startMinute < window.endMinute
  )
  if (!containingWindow) return [] as Array<{ label: string, value: string }>

  // If the selected start is inside an occupied interval due to stale state, keep empty.
  const overlapsOccupied = intervals.some(interval => startMinute >= interval.startMinute && startMinute < interval.endMinute)
  if (overlapsOccupied) return [] as Array<{ label: string, value: string }>

  return buildOptions({
    key,
    fromMinute: startMinute,
    toMinute: containingWindow.endMinute
  })
})

watch(selectedDayEndOptions, (options) => {
  if (!options.length) return
  const current = rescheduleForm.endTime
  if (!options.some(option => option.value === current)) {
    rescheduleForm.endTime = options[0]?.value ?? ''
  }
})

const rescheduleMonthCells = computed(() => {
  const anchor = localInputToDateTime(rescheduleForm.startTime)?.setZone(STUDIO_TZ)
    ?? DateTime.now().setZone(STUDIO_TZ)
  const monthStart = (rescheduleMonthCursor.value ?? anchor.startOf('month')).setZone(STUDIO_TZ).startOf('month')
  const monthEnd = monthStart.endOf('month')
  const leading = monthStart.weekday % 7
  const cells: Array<{ key: string, day: number, status: 'clear' | 'medium' | 'heavy', selected: boolean, disabled: boolean } | null> = []
  const nowLa = DateTime.now().setZone(STUDIO_TZ).startOf('day')
  const reachEnd = DateTime.now().setZone(STUDIO_TZ).plus({ days: Math.max(1, rescheduleBookingWindowDays.value || 30) }).endOf('day')

  for (let i = 0; i < leading; i++) cells.push(null)

  let cursor = monthStart
  while (cursor <= monthEnd) {
    const key = toDayKey(cursor)
    const occupied = Number(dayOccupiedMinutes.value[key] ?? 0)
    const status: 'clear' | 'medium' | 'heavy' = occupied === 0
      ? 'clear'
      : occupied >= 10 * 60
        ? 'heavy'
        : 'medium'
    const possibleStarts = possibleStartMinutesForDay(key)
    const disabled = cursor.startOf('day') < nowLa || cursor.startOf('day') > reachEnd || possibleStarts.length === 0
    cells.push({
      key,
      day: cursor.day,
      status,
      selected: selectedRescheduleDay.value === key,
      disabled
    })
    cursor = cursor.plus({ days: 1 })
  }

  return cells
})

function applyRescheduleDay(key: string) {
  const possibleStarts = possibleStartMinutesForDay(key)
  if (!possibleStarts.length) return

  const current = localInputToDateTime(rescheduleForm.startTime)?.setZone(STUDIO_TZ)
    ?? DateTime.now().setZone(STUDIO_TZ).set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
  const [year, month, day] = key.split('-').map(Number)
  const dayBase = DateTime.fromObject({
    year,
    month,
    day
  }, { zone: STUDIO_TZ })
  if (!dayBase.isValid) return

  let minute: number
  if (selectedRescheduleDay.value === key) {
    const index = (rescheduleDayCycleIndex.value[key] ?? 0) + 1
    rescheduleDayCycleIndex.value[key] = index
    minute = possibleStarts[index % possibleStarts.length] ?? possibleStarts[0] ?? (current.hour * 60 + current.minute)
  } else {
    const preferred = reschedulePreferredStartMinute.value
    if (preferred === null) {
      minute = possibleStarts[0] ?? (current.hour * 60 + current.minute)
    } else {
      const sortedByDistance = [...possibleStarts].sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))
      minute = sortedByDistance[0] ?? possibleStarts[0] ?? (current.hour * 60 + current.minute)
    }
    const chosenIndex = possibleStarts.findIndex(value => value === minute)
    rescheduleDayCycleIndex.value[key] = Math.max(0, chosenIndex)
  }
  const next = dayBase.plus({ minutes: minute })
  if (!next.isValid) return
  rescheduleAutoSyncEnd.value = true
  onRescheduleStartChange(next.toFormat('yyyy-LL-dd\'T\'HH:mm'))
}

const rescheduleSummaryLabel = computed(() => {
  const minutes = Math.max(1, Math.round(rescheduleDurationMinutes.value || 60))
  const hours = Math.round((minutes / 60) * 100) / 100
  const hoursLabel = Number.isInteger(hours) ? `${hours.toFixed(0)}hr` : `${hours}hr`
  const holdLabel = shouldAccountForHold.value ? ' + hold' : ''
  if (rescheduleMode.value === 'extend') {
    const baseEnd = localInputToDateTime(rescheduleBaseEndTime.value)
    const targetEnd = localInputToDateTime(rescheduleForm.endTime)
    const extraMinutes = (baseEnd && targetEnd && targetEnd > baseEnd)
      ? Math.round(targetEnd.diff(baseEnd, 'minutes').minutes)
      : 0
    const extraHours = Math.round((Math.max(0, extraMinutes) / 60) * 100) / 100
    const extraLabel = extraHours > 0
      ? (Number.isInteger(extraHours) ? `${extraHours.toFixed(0)}hr` : `${extraHours}hr`)
      : '0hr'
    return `Extend by ${extraLabel}${holdLabel}`
  }
  return `${hoursLabel} booking${holdLabel}`
})

const rescheduleLockedStartLabel = computed(() => {
  const start = localInputToDateTime(rescheduleLockedStartTime.value)?.setZone(STUDIO_TZ)
  if (!start || !start.isValid) return rescheduleLockedStartTime.value || '—'
  return start.toFormat('EEE, LLL d · h:mm a')
})

const rescheduleMonthLabel = computed(() => {
  const cursor = (rescheduleMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)).setZone(STUDIO_TZ)
  return cursor.toFormat('LLLL yyyy')
})

const canGoToPrevMonth = computed(() => {
  const cursor = (rescheduleMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)).setZone(STUDIO_TZ).startOf('month')
  const currentMonth = DateTime.now().setZone(STUDIO_TZ).startOf('month')
  return cursor > currentMonth
})

const canGoToNextMonth = computed(() => {
  const cursor = (rescheduleMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)).setZone(STUDIO_TZ).startOf('month')
  const reachEnd = DateTime.now().setZone(STUDIO_TZ).plus({ days: Math.max(1, rescheduleBookingWindowDays.value || 30) }).endOf('day')
  return cursor.plus({ months: 1 }).startOf('month') <= reachEnd.startOf('month')
})

function goToPrevRescheduleMonth() {
  if (!canGoToPrevMonth.value) return
  const cursor = (rescheduleMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)).setZone(STUDIO_TZ).startOf('month').minus({ months: 1 })
  rescheduleMonthCursor.value = cursor
  rescheduleHintMonth.value = ''
  void loadRescheduleMonthHints(rescheduleForm.startTime)
}

function goToNextRescheduleMonth() {
  if (!canGoToNextMonth.value) return
  const cursor = (rescheduleMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)).setZone(STUDIO_TZ).startOf('month').plus({ months: 1 })
  rescheduleMonthCursor.value = cursor
  rescheduleHintMonth.value = ''
  void loadRescheduleMonthHints(rescheduleForm.startTime)
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function cadenceLabel(c: string) {
  if (c === 'daily') return 'Daily'
  if (c === 'weekly') return 'Weekly'
  if (c === 'monthly') return 'Monthly'
  if (c === 'quarterly') return 'Quarterly'
  if (c === 'annual') return 'Annual'
  return c
}

function cadencePriceUnit(cadence: string) {
  if (cadence === 'daily') return 'day'
  if (cadence === 'weekly') return 'week'
  if (cadence === 'monthly') return 'mo'
  if (cadence === 'quarterly') return 'qtr'
  if (cadence === 'annual') return 'yr'
  return cadence
}

function cadenceCreditsUnit(cadence: string) {
  if (cadence === 'daily') return 'day'
  if (cadence === 'weekly') return 'week'
  return 'mo'
}

function formatPeakCredits(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function goCheckout(tierId: string, cadence: string) {
  router.push(`/checkout?tier=${encodeURIComponent(tierId)}&cadence=${encodeURIComponent(cadence)}&returnTo=/dashboard/bookings`)
}

onMounted(() => {
  nowIso.value = new Date().toISOString()
  void openRescheduleFromQuery()
})

watch(
  () => [route.query.reschedule, route.query.extend, upcoming.value?.length ?? 0],
  () => { void openRescheduleFromQuery() }
)
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <UDashboardPanel
      id="bookings"
      class="min-h-0 flex-1"
    >
      <template #header>
        <UDashboardNavbar
          title="My Bookings"
          :ui="{ right: 'gap-3' }"
        >
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <template v-if="hasMembership">
              <UButton
                size="sm"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                @click="refreshAll"
              />
              <UButton
                size="sm"
                icon="i-lucide-calendar-plus"
                to="/dashboard/book"
              >
                Book studio
              </UButton>
            </template>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <!-- ── No active membership: show tier upsell ── -->
        <div
          v-if="!hasMembership"
          class="p-4 space-y-6"
        >
          <UCard>
            <div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="font-semibold">
                  You don't have an active membership
                </p>
                <p class="mt-1 text-sm text-dimmed">
                  Choose a plan below to unlock studio booking, credits, and priority access.
                </p>
              </div>
              <UBadge
                color="warning"
                variant="soft"
              >
                No active plan
              </UBadge>
            </div>
          </UCard>

          <div class="grid gap-4 lg:grid-cols-3">
            <UCard
              v-for="tier in tiers"
              :key="tier.id"
            >
              <div class="flex items-center gap-2">
                <div class="text-base font-semibold">
                  {{ tier.display_name }}
                </div>
                <UBadge
                  v-if="tier.adminOnly"
                  color="warning"
                  variant="soft"
                  size="xs"
                  icon="i-lucide-flask-conical"
                >
                  Admin only
                </UBadge>
              </div>
              <p
                v-if="tier.description"
                class="mt-1 text-sm text-dimmed"
              >
                {{ tier.description }}
              </p>

              <div class="mt-4 grid grid-cols-3 gap-2">
                <div class="rounded-lg border border-default p-2 text-center">
                  <div class="text-sm font-medium">
                    {{ tier.booking_window_days }}d
                  </div>
                  <div class="text-xs text-dimmed">
                    booking
                  </div>
                </div>
                <div class="rounded-lg border border-default p-2 text-center">
                  <div class="text-sm font-medium">
                    {{ formatPeakCredits(tier.peak_multiplier) }} cr/hr
                  </div>
                  <div class="text-xs text-dimmed">
                    peak hour
                  </div>
                </div>
                <div class="rounded-lg border border-default p-2 text-center">
                  <div class="text-sm font-medium">
                    {{ tier.max_bank }}
                  </div>
                  <div class="text-xs text-dimmed">
                    credit cap
                  </div>
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
                      <UBadge
                        v-if="getDiscountLabel(opt.discount_label)"
                        color="neutral"
                        variant="soft"
                        size="xs"
                      >
                        {{ getDiscountLabel(opt.discount_label) }}
                      </UBadge>
                    </div>
                    <div class="text-xs text-dimmed">
                      {{ opt.credits_per_month }} credits/{{ cadenceCreditsUnit(opt.cadence) }}
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-semibold">
                      {{ formatMoney(opt.price_cents, opt.currency) }}
                    </div>
                    <div class="text-xs text-dimmed">
                      / {{ cadencePriceUnit(opt.cadence) }}
                    </div>
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
        <div
          v-else
          class="p-4 space-y-6"
        >
          <UAlert
            color="neutral"
            variant="soft"
            icon="i-lucide-info"
            :description="`Reschedules require at least ${memberRescheduleNoticeHours} hours notice before the booking start time.`"
          />

          <div class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                size="sm"
                :variant="bookingsTab === 'active' ? 'solid' : 'soft'"
                :color="bookingsTab === 'active' ? 'primary' : 'neutral'"
                @click="bookingsTab = 'active'"
              >
                Active bookings
              </UButton>
              <UButton
                size="sm"
                :variant="bookingsTab === 'holds' ? 'solid' : 'soft'"
                :color="bookingsTab === 'holds' ? 'primary' : 'neutral'"
                @click="bookingsTab = 'holds'"
              >
                Active holds
              </UButton>
              <UButton
                size="sm"
                :variant="bookingsTab === 'past' ? 'solid' : 'soft'"
                :color="bookingsTab === 'past' ? 'primary' : 'neutral'"
                @click="bookingsTab = 'past'"
              >
                Past bookings
              </UButton>
            </div>

            <div v-if="bookingsTab === 'active'">
              <div
                v-if="!upcoming?.length"
                class="rounded-lg border border-default p-6 text-center"
              >
                <UIcon
                  name="i-lucide-calendar-x"
                  class="size-8 text-dimmed mx-auto mb-2"
                />
                <p class="text-sm text-dimmed">
                  No upcoming bookings.
                </p>
                <UButton
                  class="mt-3"
                  size="sm"
                  to="/dashboard/book"
                >
                  Book studio time
                </UButton>
              </div>

              <div
                v-else
                class="space-y-2"
              >
                <UCard
                  v-for="booking in upcoming"
                  :key="booking.id"
                  :ui="{ body: 'p-4 sm:p-4' }"
                >
                  <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <UBadge
                          :color="statusColor(booking.status)"
                          variant="soft"
                          size="sm"
                        >
                          {{ formatStatus(booking.status) }}
                        </UBadge>
                        <span class="text-sm font-medium">{{ formatRange(booking.start_time, booking.end_time).dateStr }}</span>
                      </div>
                      <p class="mt-1 text-sm text-dimmed">
                        {{ formatRange(booking.start_time, booking.end_time).timeStr }}
                        · {{ durationLabel(booking.start_time, booking.end_time) }}
                        <span v-if="booking.credits_burned"> · {{ booking.credits_burned }} credits</span>
                      </p>
                      <p
                        v-if="hasHold(booking)"
                        class="mt-1 text-xs text-amber-600 dark:text-amber-400"
                      >
                        Overnight hold attached
                        <span v-if="holdRangeLabel(booking)">
                          · {{ holdRangeLabel(booking)?.timeStr }}
                        </span>
                      </p>
                      <p
                        v-if="booking.notes"
                        class="mt-1.5 text-xs text-dimmed italic truncate max-w-sm"
                      >
                        {{ booking.notes }}
                      </p>
                    </div>
                    <div class="shrink-0 flex items-center gap-2">
                      <UDropdownMenu
                        :items="bookingExportItems(booking)"
                        :content="{ align: 'end' }"
                      >
                        <UButton
                          size="sm"
                          color="neutral"
                          variant="soft"
                          icon="i-lucide-calendar-plus"
                        >
                          Add to calendar
                        </UButton>
                      </UDropdownMenu>
                      <UTooltip
                        v-if="canExtend(booking)"
                        text="Extend end time if the next slot is open."
                      >
                        <UButton
                          size="sm"
                          color="primary"
                          variant="soft"
                          @click="openExtension(booking)"
                        >
                          Extend
                        </UButton>
                      </UTooltip>
                      <UTooltip
                        :text="canReschedule(booking)
                          ? `Reschedule booking (${memberRescheduleNoticeHours}+h notice)`
                          : rescheduleLockReason(booking)"
                      >
                        <UButton
                          size="sm"
                          color="neutral"
                          variant="soft"
                          :disabled="!canReschedule(booking)"
                          @click="openReschedule(booking)"
                        >
                          Reschedule
                        </UButton>
                      </UTooltip>
                      <UTooltip
                        v-if="canCancelHoldOnly(booking)"
                        :text="isRefundEligible(booking) ? 'Cancel hold only · hold token can be returned' : 'Cancel hold only · no hold return (< 24h)'"
                      >
                        <UButton
                          size="sm"
                          color="warning"
                          variant="soft"
                          :loading="holdCancellingId === booking.id"
                          @click="cancelBookingHold(booking.id)"
                        >
                          Cancel hold
                        </UButton>
                      </UTooltip>
                      <UTooltip
                        :text="canCancel(booking) ? 'Cancel · credit refund eligible' : cancelLockReason(booking)"
                      >
                        <UButton
                          size="sm"
                          color="error"
                          variant="soft"
                          :disabled="!canCancel(booking)"
                          :loading="cancellingId === booking.id"
                          @click="openCancelConfirm(booking)"
                        >
                          Cancel
                        </UButton>
                      </UTooltip>
                    </div>
                  </div>
                </UCard>
              </div>
            </div>

            <div v-else-if="bookingsTab === 'holds'">
              <div
                v-if="!activeHoldBookings.length"
                class="rounded-lg border border-default p-6 text-center"
              >
                <p class="text-sm text-dimmed">
                  No active holds right now.
                </p>
              </div>
              <div
                v-else
                class="space-y-2"
              >
                <UCard
                  v-for="booking in activeHoldBookings"
                  :key="`${booking.id}-hold`"
                  :ui="{ body: 'p-4 sm:p-4' }"
                >
                  <div class="flex items-start justify-between gap-3 flex-wrap">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <UBadge
                          color="warning"
                          variant="soft"
                          size="sm"
                        >
                          Equipment Hold
                        </UBadge>
                        <span class="text-sm font-medium">{{ formatRange(booking.start_time, booking.end_time).dateStr }}</span>
                      </div>
                      <p class="mt-1 text-sm text-dimmed">
                        Booking · {{ formatRange(booking.start_time, booking.end_time).timeStr }}
                      </p>
                      <p
                        v-if="holdRangeLabel(booking)"
                        class="mt-1 text-sm text-dimmed"
                      >
                        Hold · {{ holdRangeLabel(booking)?.timeStr }}
                      </p>
                    </div>
                    <div class="shrink-0 flex items-center gap-2">
                      <UDropdownMenu
                        :items="bookingExportItems(booking)"
                        :content="{ align: 'end' }"
                      >
                        <UButton
                          size="sm"
                          color="neutral"
                          variant="soft"
                          icon="i-lucide-calendar-plus"
                        >
                          Add to calendar
                        </UButton>
                      </UDropdownMenu>
                      <UTooltip
                        :text="isRefundEligible(booking) ? 'Cancel hold only · hold token can be returned' : 'Cancel hold only · no hold return (< 24h)'"
                      >
                        <UButton
                          size="sm"
                          color="warning"
                          variant="soft"
                          :loading="holdCancellingId === booking.id"
                          @click="cancelBookingHold(booking.id)"
                        >
                          Cancel hold
                        </UButton>
                      </UTooltip>
                    </div>
                  </div>
                </UCard>
              </div>
            </div>

            <div v-else>
              <div
                v-if="!past?.length"
                class="rounded-lg border border-default p-6 text-center"
              >
                <p class="text-sm text-dimmed">
                  No booking history yet.
                </p>
              </div>

              <div
                v-else
                class="space-y-3"
              >
                <div class="space-y-2">
                  <UCard
                    v-for="booking in paginatedPastBookings"
                    :key="booking.id"
                    :ui="{ body: 'p-4 sm:p-4' }"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <UBadge
                            :color="statusColor(booking.status)"
                            variant="soft"
                            size="sm"
                          >
                            {{ formatStatus(booking.status) }}
                          </UBadge>
                          <span class="text-sm font-medium">{{ formatRange(booking.start_time, booking.end_time).dateStr }}</span>
                        </div>
                        <p class="mt-1 text-sm text-dimmed">
                          {{ formatRange(booking.start_time, booking.end_time).timeStr }}
                          · {{ durationLabel(booking.start_time, booking.end_time) }}
                          <span v-if="booking.credits_burned"> · {{ booking.credits_burned }} credits</span>
                        </p>
                        <p
                          v-if="booking.notes"
                          class="mt-1.5 text-xs text-dimmed italic truncate max-w-sm"
                        >
                          {{ booking.notes }}
                        </p>
                      </div>
                      <div class="shrink-0">
                        <UDropdownMenu
                          :items="bookingExportItems(booking)"
                          :content="{ align: 'end' }"
                        >
                          <UButton
                            size="sm"
                            color="neutral"
                            variant="soft"
                            icon="i-lucide-calendar-plus"
                          >
                            Add to calendar
                          </UButton>
                        </UDropdownMenu>
                      </div>
                    </div>
                  </UCard>
                </div>

                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs text-dimmed">
                    Page {{ pastPage }} of {{ pastTotalPages }}
                  </p>
                  <div class="flex items-center gap-2">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      :disabled="pastPage <= 1"
                      @click="goToPastPage(pastPage - 1)"
                    >
                      Previous
                    </UButton>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      :disabled="pastPage >= pastTotalPages"
                      @click="goToPastPage(pastPage + 1)"
                    >
                      Next
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UDashboardPanel>

    <UModal
      v-model:open="rescheduleOpen"
      :dismissible="!reschedulingId"
    >
      <template #content>
        <UCard
          class="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-h-[calc(100dvh-4rem)]"
          :ui="{ body: 'overflow-y-scroll' }"
        >
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-base font-semibold">
                {{ rescheduleMode === 'extend' ? 'Extend booking' : 'Reschedule booking' }}
              </h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="Boolean(reschedulingId)"
                @click="closeReschedule"
              />
            </div>
          </template>

          <div class="space-y-3">
            <div class="text-sm text-dimmed">
              {{ rescheduleSummaryLabel }}
            </div>
            <UFormField
              v-if="rescheduleMode === 'reschedule'"
              label="Start"
            >
              <select
                class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
                :value="rescheduleForm.startTime"
                @change="onRescheduleStartSelectChange"
              >
                <option
                  v-if="!selectedDayStartOptions.length"
                  disabled
                  value=""
                >
                  No available start times for selected day
                </option>
                <option
                  v-for="option in selectedDayStartOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </UFormField>
            <UFormField
              v-else
              label="Start (locked)"
            >
              <UInput
                :model-value="rescheduleLockedStartLabel"
                readonly
                disabled
              />
            </UFormField>
            <UFormField :label="rescheduleMode === 'extend' ? 'New end time' : 'End'">
              <select
                class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
                :value="rescheduleForm.endTime"
                @change="onRescheduleEndSelectChange"
              >
                <option
                  v-if="!selectedDayEndOptions.length"
                  disabled
                  value=""
                >
                  No available end times for selected start
                </option>
                <option
                  v-for="option in selectedDayEndOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </UFormField>
            <p class="text-xs text-dimmed">
              <template v-if="rescheduleMode === 'extend'">
                Pick a later end time. Extension keeps your existing start time and only succeeds if the next slot is available.
              </template>
              <template v-else>
                End time follows the original booking length by default when you move start time. Edit end time directly to override.
              </template>
            </p>
            <div
              v-if="rescheduleMode === 'reschedule'"
              class="rounded-lg border border-default p-3 space-y-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="space-y-1">
                  <p class="text-sm font-medium">
                    Day load
                  </p>
                  <p class="text-xs text-dimmed">
                    Slashed days cannot fit this booking length.
                  </p>
                </div>
                <div class="flex items-center gap-1.5">
                  <UButton
                    icon="i-lucide-chevron-left"
                    color="neutral"
                    variant="soft"
                    size="xs"
                    :disabled="!canGoToPrevMonth"
                    @click="goToPrevRescheduleMonth"
                  />
                  <span class="min-w-28 text-center text-xs font-medium">
                    {{ rescheduleMonthLabel }}
                  </span>
                  <UButton
                    icon="i-lucide-chevron-right"
                    color="neutral"
                    variant="soft"
                    size="xs"
                    :disabled="!canGoToNextMonth"
                    @click="goToNextRescheduleMonth"
                  />
                </div>
              </div>
              <div class="flex items-center gap-3 text-xs text-dimmed">
                <span class="inline-flex items-center gap-1.5">
                  <span class="size-2 rounded-full border border-default" />
                  Clear
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <span class="size-2 rounded-full bg-amber-500" />
                  Medium
                </span>
                <span class="inline-flex items-center gap-1.5">
                  <span class="size-2 rounded-full bg-red-500" />
                  Heavy
                </span>
              </div>
              <p
                v-if="rescheduleHintsLoading"
                class="text-xs text-dimmed"
              >
                Refreshing day load hints…
              </p>
              <p
                v-if="rescheduleHintsError"
                class="text-xs text-red-500 dark:text-red-400"
              >
                {{ rescheduleHintsError }}
              </p>
              <div
                class="relative"
              >
                <div
                  class="grid grid-cols-7 gap-1.5 transition-opacity"
                  :class="rescheduleHintsLoading ? 'opacity-70' : 'opacity-100'"
                >
                  <button
                    v-for="(cell, idx) in rescheduleMonthCells"
                    :key="cell?.key ?? `blank-${idx}`"
                    type="button"
                    class="relative h-9 rounded-md border text-xs"
                    :class="cell
                      ? (cell.selected
                        ? (cell.disabled ? 'border-black bg-black text-white/50' : 'border-primary bg-primary/10')
                        : (cell.disabled ? 'border-black bg-black text-white/40' : 'border-default hover:bg-elevated'))
                      : 'border-transparent opacity-0 pointer-events-none'"
                    :disabled="!cell || cell.disabled"
                    @click="cell && applyRescheduleDay(cell.key)"
                  >
                    <span
                      v-if="cell"
                      class="inline-flex w-full items-center justify-center gap-1.5"
                    >
                      <span>{{ cell.day }}</span>
                      <span
                        class="size-1.5 rounded-full"
                        :class="cell.status === 'heavy'
                          ? 'bg-red-500'
                          : cell.status === 'medium'
                            ? 'bg-amber-500'
                            : 'border border-default'"
                      />
                    </span>
                    <span
                      v-if="cell?.disabled"
                      class="pointer-events-none absolute inset-0"
                    >
                      <span class="absolute left-1 right-1 top-1/2 -translate-y-1/2 border-t border-dimmed rotate-[-20deg]" />
                    </span>
                  </button>
                </div>
                <div
                  v-if="rescheduleHintsLoading"
                  class="pointer-events-none absolute inset-0 rounded-md"
                />
              </div>
              <div
                v-if="selectedRescheduleDay"
                class="space-y-1"
              >
                <p class="text-xs font-medium">
                  Open windows for selected day
                </p>
                <p
                  v-if="!selectedDayFitWindows.length"
                  class="text-xs text-dimmed"
                >
                  No windows can fit {{ Math.max(1, Math.round(rescheduleDurationMinutes || 60)) }} minutes.
                </p>
                <p
                  v-else
                  class="text-xs text-dimmed"
                >
                  {{ selectedDayFitWindows.slice(0, 4).map(window => `${formatMinuteOfDay(window.startMinute)}–${formatMinuteOfDay(window.endMinute)}`).join(' · ') }}
                </p>
              </div>
            </div>
            <UFormField
              label="Notes"
              hint="Optional"
            >
              <UInput
                v-model="rescheduleForm.notes"
                placeholder="Optional update notes"
              />
            </UFormField>
            <UFormField
              label="Overnight hold"
              :description="`Requires a minimum booking length and an end time of ${holdMinEndLabel} or later.`"
            >
              <div class="space-y-2">
                <UAlert
                  v-if="rescheduleTargetHasHold"
                  color="warning"
                  variant="soft"
                  icon="i-lucide-package"
                  description="This booking currently has an overnight hold. Saving this reschedule releases it; re-enable hold below to add it again."
                />
                <UAlert
                  v-if="!canShowRescheduleHoldOption"
                  color="warning"
                  variant="soft"
                  icon="i-lucide-circle-alert"
                  :description="rescheduleHoldEligibility.reasons.join(' ')"
                />
                <UCheckbox
                  v-if="canShowRescheduleHoldOption"
                  v-model="rescheduleForm.requestHold"
                  label="Request overnight hold"
                />
                <UFormField
                  v-if="rescheduleForm.requestHold && holdSelectionRequired"
                  label="Hold payment method"
                >
                  <USelect
                    v-model="rescheduleForm.holdPaymentMethod"
                    :items="holdPaymentOptions"
                    option-attribute="label"
                    value-attribute="value"
                  />
                </UFormField>
                <p
                  v-if="rescheduleForm.requestHold"
                  class="text-xs text-dimmed"
                >
                  Holds use included allowance first. If none remain, a paid hold token is used, or {{ holdCreditCost }} credit{{ holdCreditCost === 1 ? '' : 's' }} based on your selection. Holds run until {{ holdEndLabel }} the next day. Hold time does not count as booking hours, and door locks do not work during hold hours unless staff is contacted first.
                </p>
              </div>
            </UFormField>
            <p class="text-xs text-dimmed">
              <template v-if="rescheduleMode === 'extend'">
                Extensions can be requested until the booking ends and require enough credits for the added time.
              </template>
              <template v-else>
                Reschedules are available until {{ memberRescheduleNoticeHours }} hours before the session start.
              </template>
            </p>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="Boolean(reschedulingId)"
                @click="closeReschedule"
              >
                Close
              </UButton>
              <UButton
                :loading="Boolean(reschedulingId)"
                @click="saveReschedule"
              >
                {{ rescheduleMode === 'extend' ? 'Confirm extension' : 'Save changes' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal
      v-model:open="cancelConfirmOpen"
      :dismissible="!cancellingId"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-base font-semibold">
                Cancel booking?
              </h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="Boolean(cancellingId)"
                @click="closeCancelConfirm"
              />
            </div>
          </template>

          <div
            v-if="cancelTarget"
            class="space-y-3"
          >
            <p class="text-sm text-dimmed">
              This will cancel your booking and release the time slot.
            </p>
            <div class="rounded-lg border border-default p-3 text-sm">
              <div class="font-medium">
                {{ formatRange(cancelTarget.start_time, cancelTarget.end_time).dateStr }}
              </div>
              <div class="text-dimmed">
                {{ formatRange(cancelTarget.start_time, cancelTarget.end_time).timeStr }}
              </div>
            </div>
            <UAlert
              color="warning"
              variant="soft"
              icon="i-lucide-info"
              :description="isRefundEligible(cancelTarget) ? 'Cancellation is outside 24h and credits are expected to be refunded.' : 'Cancellation is unavailable within 24h of booking start or after it has started.'"
            />
            <UAlert
              v-if="hasHold(cancelTarget)"
              color="warning"
              variant="soft"
              icon="i-lucide-package"
              :description="isRefundEligible(cancelTarget) ? 'A hold is attached. You can cancel just the hold and return a hold token, or cancel the full booking.' : 'A hold is attached. Within 24h, hold tokens are forfeited when a hold is canceled.'"
            />
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="Boolean(cancellingId) || Boolean(holdCancellingId)"
                @click="closeCancelConfirm"
              >
                Keep booking
              </UButton>
              <UButton
                v-if="cancelTarget && canCancelHoldOnly(cancelTarget)"
                color="warning"
                variant="soft"
                :loading="Boolean(holdCancellingId)"
                :disabled="Boolean(cancellingId)"
                @click="cancelBookingHold(cancelTarget.id)"
              >
                Cancel hold only
              </UButton>
              <UButton
                color="error"
                :loading="Boolean(cancellingId)"
                :disabled="Boolean(holdCancellingId) || !cancelTarget || !canCancel(cancelTarget)"
                @click="confirmCancel"
              >
                Confirm cancel
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
