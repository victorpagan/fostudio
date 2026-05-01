<script setup lang="ts">
import type {
  DateSelectArg,
  DatesSetArg,
  EventInput
} from '@fullcalendar/core'
import { DateTime } from 'luxon'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'

type CalendarEvent = EventInput & {
  id?: string
  start?: string
  end?: string
  title?: string
  extendedProps?: {
    type?: 'booking' | 'hold' | 'external' | 'block' | 'standby' | 'past-blackout'
    isOwn?: boolean
    status?: string
    rateKind?: string
    bookingId?: string
    blockId?: string
    notes?: string
    provider?: string
    location?: string
    isGuest?: boolean
    calendarId?: string
    paymentExpiresAt?: string | null
    minOpenSlotHours?: number
  }
}

type PeakWindow = {
  timezone: string
  days: number[]
  startHour: number
  endHour: number
  daysLabel: string
  windowLabel: string
  multiplier: number | null
}

type WorkshopPromo = {
  bookingId: string
  startsAt: string
  endsAt: string
  title: string | null
  description: string | null
  link: string | null
}

const props = withDefaults(defineProps<{
  endpoint: string // '/api/calendar/public' or '/api/calendar/member'
  fullDay?: boolean
  adminView?: boolean
  showStandbyBadge?: boolean
  showStandbyZones?: boolean
}>(), {
  fullDay: false,
  adminView: false,
  showStandbyBadge: true,
  showStandbyZones: true
})

const emit = defineEmits<{
  (e: 'select', payload: { start: Date, end: Date, rateKind?: 'standard' | 'standby' }): void
  (e: 'booking-click', payload: {
    bookingId: string
    start: string
    end: string
    status?: string
    rateKind?: string
    notes?: string
    paymentExpiresAt?: string | null
  }): void
  (e: 'block-click', payload: {
    blockId: string
    start: string
    end: string
    notes?: string
  }): void
}>()

const loading = ref(false)
const events = ref<CalendarEvent[]>([])
const visibleTitle = ref('This week')
const visibleRange = ref('Loading schedule')
const lastRefreshedAt = ref<string | null>(null)
const bookingWindowDays = ref<number | null>(null)
const guestBookingStartHour = ref<number | null>(null)
const guestBookingEndHour = ref<number | null>(null)
const guestMinBookingHours = ref<number | null>(null)
const guestBookingIncrementMinutes = ref<number | null>(null)
const peakWindow = ref<PeakWindow | null>(null)
const workshopPromo = ref<WorkshopPromo | null>(null)
const nowTickMs = ref(Date.now())
const lastLoadRangeStart = ref<Date | null>(null)
const lastLoadRangeEnd = ref<Date | null>(null)
const activeLegendPopup = ref<'peak' | 'standby' | null>(null)
const peakZonesHighlighted = ref(false)
const standbyZonesHighlighted = ref(false)
let nowTickTimer: ReturnType<typeof setInterval> | null = null
const instance = getCurrentInstance()
const STUDIO_TZ = 'America/Los_Angeles'

type CalendarResponse = {
  from?: string
  to?: string
  bookingWindowDays?: number
  guestBookingStartHour?: number
  guestBookingEndHour?: number
  guestMinBookingHours?: number
  guestBookingIncrementMinutes?: number
  peakWindow?: PeakWindow | null
  workshopPromo?: WorkshopPromo | null
  events: CalendarEvent[]
}

function formatRange(start: Date, end: Date) {
  const studioStart = calendarDateToStudioDate(start)
  const studioEnd = calendarDateToStudioDate(end)
  const startLabel = studioStart.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: STUDIO_TZ
  })
  const endMinusTick = new Date(studioEnd.getTime() - 1)
  const endLabel = endMinusTick.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: STUDIO_TZ
  })
  return `${startLabel} to ${endLabel}`
}

function parseApiDateTime(value: string) {
  const asIso = DateTime.fromISO(value, { setZone: true })
  if (asIso.isValid) return asIso.toUTC()
  const asSql = DateTime.fromSQL(value, { zone: 'utc' })
  if (asSql.isValid) return asSql.toUTC()
  return null
}

// Converts a true instant into a synthetic UTC timestamp that renders as LA wall-time in FullCalendar.
function studioInstantToCalendarIso(value: string | Date) {
  const instantUtc = typeof value === 'string'
    ? parseApiDateTime(value)
    : DateTime.fromJSDate(value, { zone: 'utc' })

  if (!instantUtc || !instantUtc.isValid) {
    return typeof value === 'string' ? value : value.toISOString()
  }

  const la = instantUtc.setZone(STUDIO_TZ)
  const pseudoUtc = DateTime.fromObject(
    {
      year: la.year,
      month: la.month,
      day: la.day,
      hour: la.hour,
      minute: la.minute,
      second: la.second,
      millisecond: la.millisecond
    },
    { zone: 'utc' }
  )
  return pseudoUtc.toISO() ?? (typeof value === 'string' ? value : value.toISOString())
}

// Converts synthetic UTC calendar timestamps back into true instants in LA.
function calendarDateToStudioDate(value: Date) {
  const pseudoUtc = DateTime.fromJSDate(value, { zone: 'utc' })
  const laInstant = DateTime.fromObject(
    {
      year: pseudoUtc.year,
      month: pseudoUtc.month,
      day: pseudoUtc.day,
      hour: pseudoUtc.hour,
      minute: pseudoUtc.minute,
      second: pseudoUtc.second,
      millisecond: pseudoUtc.millisecond
    },
    { zone: STUDIO_TZ }
  ).toUTC()

  return laInstant.toJSDate()
}

function mapApiEventsToCalendar(events: CalendarEvent[]) {
  return events.map(event => ({
    ...event,
    start: event.start ? studioInstantToCalendarIso(event.start) : event.start,
    end: event.end ? studioInstantToCalendarIso(event.end) : event.end
  }))
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function formatNoteHtml(value: string) {
  const normalized = value.replaceAll('\\n', '\n')
  return escapeHtml(normalized).replaceAll('\n', '<br />')
}

async function loadEvents(rangeStart?: Date, rangeEnd?: Date) {
  loading.value = true
  lastLoadRangeStart.value = rangeStart ?? null
  lastLoadRangeEnd.value = rangeEnd ?? null
  try {
    const q: Record<string, string> = {}
    if (rangeStart) q.from = calendarDateToStudioDate(rangeStart).toISOString()
    if (rangeEnd) q.to = calendarDateToStudioDate(rangeEnd).toISOString()

    const res = await $fetch<CalendarResponse>(props.endpoint, { query: q })
    events.value = mapApiEventsToCalendar(res.events ?? [])
    bookingWindowDays.value = res.bookingWindowDays ?? null
    guestBookingStartHour.value = Number.isFinite(Number(res.guestBookingStartHour))
      ? Number(res.guestBookingStartHour)
      : null
    guestBookingEndHour.value = Number.isFinite(Number(res.guestBookingEndHour))
      ? Number(res.guestBookingEndHour)
      : null
    guestMinBookingHours.value = Number.isFinite(Number(res.guestMinBookingHours))
      ? Number(res.guestMinBookingHours)
      : null
    guestBookingIncrementMinutes.value = Number.isFinite(Number(res.guestBookingIncrementMinutes))
      ? Number(res.guestBookingIncrementMinutes)
      : null
    peakWindow.value = res.peakWindow ?? null
    workshopPromo.value = res.workshopPromo ?? null
    lastRefreshedAt.value = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles'
    })
  } finally {
    loading.value = false
  }
}

function isExpiredPendingPaymentEvent(event: CalendarEvent, nowMs = nowTickMs.value) {
  if (event.extendedProps?.type !== 'booking') return false
  if (event.extendedProps?.status !== 'pending_payment') return false
  const expiresAt = event.extendedProps.paymentExpiresAt
  if (!expiresAt) return true
  const expiresAtMs = Date.parse(expiresAt)
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs
}

const activeEvents = computed(() =>
  events.value.filter((event) => {
    if (isExpiredPendingPaymentEvent(event)) return false
    if (!props.showStandbyZones && event.extendedProps?.type === 'standby') return false
    return true
  })
)

const ownBookingCount = computed(() =>
  activeEvents.value.filter(event => event.extendedProps?.isOwn).length
)
const standbyWindowCount = computed(() =>
  activeEvents.value.filter(event => event.extendedProps?.type === 'standby').length
)
const isMemberFeed = computed(() => props.endpoint.includes('/member'))
const isPublicFeed = computed(() => props.endpoint.includes('/public'))
const isGuestConstrainedFeed = computed(() =>
  guestBookingStartHour.value !== null && guestBookingEndHour.value !== null
)
const isGuestSelectionMode = computed(() => isPublicFeed.value || isGuestConstrainedFeed.value)

function eventClassNames(arg: { event: { display: string, end?: Date | null, extendedProps: CalendarEvent['extendedProps'] } }) {
  const classes = ['fc-event-block']
  const type = arg.event.extendedProps?.type
  const eventEnd = arg.event.end
  if (eventEnd && eventEnd.getTime() < Date.now()) {
    classes.push('fc-event-past')
  }

  if (type === 'hold') {
    classes.push('fc-event-hold')
    classes.push(arg.event.extendedProps?.isOwn ? 'fc-event-hold-own' : 'fc-event-hold-other')
  }
  if (type === 'external') {
    classes.push('fc-event-external')
  }
  if (type === 'block') {
    classes.push('fc-event-blockoff')
  }
  if (type === 'standby') {
    classes.push('fc-standby-window')
  }
  if (type === 'booking') {
    classes.push('fc-event-booked')
    if (arg.event.extendedProps?.status === 'pending_payment') classes.push('fc-event-pending-payment')
    if (props.adminView) classes.push('fc-event-admin-booking')
    if (arg.event.extendedProps?.isOwn) classes.push('fc-event-own')
    else classes.push('fc-event-member')
  }

  return classes
}

function eventContent(arg: { event: { display: string, title: string, extendedProps?: CalendarEvent['extendedProps'] }, timeText: string }) {
  if (arg.event.display === 'background') return undefined

  const ext = arg.event.extendedProps ?? {}
  const isHold = ext.type === 'hold'
  const isExternal = ext.type === 'external'
  const isBlock = ext.type === 'block'
  const isOwnBooking = ext.type === 'booking' && ext.isOwn
  const isUnownedBooking = ext.type === 'booking' && !ext.isOwn
  const isPendingPayment = ext.type === 'booking' && ext.status === 'pending_payment'
  const showAdminDetail = props.adminView

  const ownNoteRaw = isOwnBooking ? (ext.notes ?? '').trim() : ''
  const adminNoteRaw = showAdminDetail ? (ext.notes ?? '').trim() : ''
  const noteRaw = showAdminDetail ? adminNoteRaw : ownNoteRaw
  const note = noteRaw ? `<div class="fc-event-note">${formatNoteHtml(noteRaw)}</div>` : ''
  const titleRaw = showAdminDetail ? arg.event.title.trim() : ''
  const title = titleRaw ? `<div class="fc-event-title">${escapeHtml(titleRaw)}</div>` : ''
  const externalMeta = showAdminDetail && isExternal
    ? [ext.provider, ext.location].map(value => String(value ?? '').trim()).filter(Boolean).join(' · ')
    : ''
  const externalMetaHtml = externalMeta ? `<div class="fc-event-note">${escapeHtml(externalMeta)}</div>` : ''

  let label = ''
  if (isPendingPayment) {
    label = ext.isOwn || showAdminDetail
      ? '<div class="fc-event-label">Pending payment</div>'
      : '<div class="fc-event-label">Temporarily reserved</div>'
  } else if (isHold) {
    label = '<div class="fc-event-label">Equipment hold</div>'
  } else if (isBlock) {
    label = '<div class="fc-event-label">Studio blocked off</div>'
  } else if (isExternal) {
    label = showAdminDetail
      ? '<div class="fc-event-label">External booking</div>'
      : '<div class="fc-event-label">Blocked</div>'
  } else if (showAdminDetail && ext.type === 'booking') {
    label = `<div class="fc-event-label">${ext.isGuest ? 'Guest booking' : 'Member booking'}</div>`
  } else if (isUnownedBooking) {
    label = '<div class="fc-event-label">Blocked</div>'
  }
  const time = arg.timeText ? `<div class="fc-event-time">${arg.timeText}</div>` : ''
  return {
    html: `${label}${time}${title}${note}${externalMetaHtml}`
  }
}

function eventDidMount(arg: { el: HTMLElement, event: { end?: Date | null, extendedProps?: CalendarEvent['extendedProps'] } }) {
  const type = arg.event.extendedProps?.type
  const harness = arg.el.closest('.fc-timegrid-event-harness')
  if (!harness) return
  const eventEnd = arg.event.end
  if (eventEnd && eventEnd.getTime() < Date.now()) {
    harness.classList.add('fc-harness-past')
  }
  if (type === 'hold') {
    harness.classList.add('fc-hold-harness')
    harness.classList.add(arg.event.extendedProps?.isOwn ? 'fc-hold-harness-own' : 'fc-hold-harness-other')
  } else if (type === 'external') {
    harness.classList.add('fc-booking-harness')
    harness.classList.add('fc-external-harness')
  } else if (type === 'block') {
    harness.classList.add('fc-booking-harness')
  } else if (type === 'booking') {
    harness.classList.add('fc-booking-harness')
  }
}

const canSelect = computed(() => Boolean(instance?.vnode.props?.onSelect))
const defaultInitialView = import.meta.client && window.matchMedia('(max-width: 767px)').matches
  ? 'timeGridDay'
  : 'timeGridWeek'
const dayHeaderFormat = {
  weekday: 'short',
  month: 'short',
  day: 'numeric'
} as const

const peakChip = computed(() => {
  if (!peakWindow.value) return null
  const base = `${peakWindow.value.daysLabel} ${peakWindow.value.windowLabel}`
  if (peakWindow.value.multiplier === null) return `Peak hours ${base}`
  const multiplier = Number.isInteger(peakWindow.value.multiplier)
    ? peakWindow.value.multiplier.toString()
    : peakWindow.value.multiplier.toFixed(2).replace(/\.?0+$/, '')
  return `Peak ${base} · ${multiplier} credits/hr`
})

const peakInfoLabel = computed(() => {
  if (!peakWindow.value) return null
  if (peakWindow.value.multiplier === null) {
    return `${peakWindow.value.daysLabel} ${peakWindow.value.windowLabel}`
  }
  const multiplier = Number.isInteger(peakWindow.value.multiplier)
    ? peakWindow.value.multiplier.toString()
    : peakWindow.value.multiplier.toFixed(2).replace(/\.?0+$/, '')
  return `${peakWindow.value.daysLabel} ${peakWindow.value.windowLabel} at ${multiplier} credits/hr`
})

const visibleRangeLabel = computed(() => {
  if (isMemberFeed.value && bookingWindowDays.value) {
    return `${visibleRange.value} (${bookingWindowDays.value}-day booking reach)`
  }
  return visibleRange.value
})

function formatCalendarTime(value: Date) {
  return value.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: STUDIO_TZ
  })
}

const standbyChipLabel = computed(() => {
  const ranges = activeEvents.value
    .filter(event => event.extendedProps?.type === 'standby')
    .map((event) => {
      const start = calendarEventDateToStudioDate(event.start)
      const end = calendarEventDateToStudioDate(event.end)
      if (!start || !end || end <= start) return null
      const minOpenSlotHours = Number(event.extendedProps?.minOpenSlotHours ?? 4)
      return { start, end, minOpenSlotHours }
    })
    .filter((range): range is { start: Date, end: Date, minOpenSlotHours: number } => Boolean(range))

  if (!ranges.length) return null

  const start = new Date(Math.min(...ranges.map(range => range.start.getTime())))
  const end = new Date(Math.max(...ranges.map(range => range.end.getTime())))
  const minHours = Math.max(...ranges.map(range => Number.isFinite(range.minOpenSlotHours) ? range.minOpenSlotHours : 4))
  const minHoursLabel = Number.isInteger(minHours) ? `${minHours}h` : `${minHours.toFixed(1).replace(/\.0$/, '')}h`
  return `Standby ${formatCalendarTime(start)}-${formatCalendarTime(end)} · ${minHoursLabel} min`
})

const standbyInfoLabel = computed(() => standbyChipLabel.value ?? 'Standby is currently available.')

function toggleLegendPopup(target: 'peak' | 'standby') {
  activeLegendPopup.value = activeLegendPopup.value === target ? null : target
}

function hourToTimeLabel(hour: number) {
  const safe = Math.max(0, Math.min(24, Math.floor(hour)))
  return `${safe.toString().padStart(2, '0')}:00:00`
}

function minutesToDuration(minutes: number) {
  const safe = Math.max(1, Math.floor(minutes))
  const hours = Math.floor(safe / 60)
  const remainder = safe % 60
  return `${hours.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}:00`
}

function formatWorkshopPromoDate(value: string) {
  const parsed = DateTime.fromISO(value, { setZone: true })
  if (!parsed.isValid) return null
  return parsed.setZone('America/Los_Angeles').toFormat('ccc, LLL d · h:mm a')
}

const workshopPromoDateLabel = computed(() => {
  if (!workshopPromo.value?.startsAt) return null
  return formatWorkshopPromoDate(workshopPromo.value.startsAt)
})

function toHourValue(dateTime: DateTime) {
  return dateTime.hour + (dateTime.minute / 60) + (dateTime.second / 3600)
}

function getGuestSelectionPolicy() {
  const minMinutes = Math.max(1, Math.round((guestMinBookingHours.value ?? 2) * 60))
  const increment = Math.max(1, Math.round(guestBookingIncrementMinutes.value ?? 60))
  return { minMinutes, increment }
}

function normalizeGuestSelectionEnd(start: Date, end: Date) {
  if (!isGuestSelectionMode.value) return end

  const startLA = DateTime.fromJSDate(start, { zone: STUDIO_TZ })
  const endLA = DateTime.fromJSDate(end, { zone: STUDIO_TZ })
  const { minMinutes, increment } = getGuestSelectionPolicy()
  const durationMinutes = Math.max(0, Math.round(endLA.diff(startLA, 'minutes').minutes))

  if (durationMinutes >= minMinutes && durationMinutes % increment === 0) return end

  const normalizedMinutes = durationMinutes <= minMinutes
    ? minMinutes
    : Math.ceil(durationMinutes / increment) * increment

  return startLA.plus({ minutes: normalizedMinutes }).toUTC().toJSDate()
}

function calendarEventDateToStudioDate(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return calendarDateToStudioDate(value)
  if (typeof value === 'number') return calendarDateToStudioDate(new Date(value))
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return calendarDateToStudioDate(parsed)
  }
  return null
}

function rangeOverlapsUnavailable(start: Date, end: Date) {
  return events.value.some((event) => {
    const type = event.extendedProps?.type
    if (event.display === 'background' || type === 'standby') return false
    if (type === 'hold' && event.extendedProps?.isOwn) return false

    const eventStart = calendarEventDateToStudioDate(event.start)
    const eventEnd = calendarEventDateToStudioDate(event.end)
    if (!eventStart || !eventEnd) return false
    return start < eventEnd && end > eventStart
  })
}

function isWithinStandbyWindow(start: Date, end: Date) {
  return activeEvents.value.some((event) => {
    if (event.extendedProps?.type !== 'standby') return false
    const eventStart = calendarEventDateToStudioDate(event.start)
    const eventEnd = calendarEventDateToStudioDate(event.end)
    if (!eventStart || !eventEnd) return false
    const minDurationMs = Math.max(0, Number(event.extendedProps?.minOpenSlotHours ?? 4)) * 60 * 60 * 1000
    if (end.getTime() - start.getTime() < minDurationMs) return false
    return start >= eventStart && end <= eventEnd
  })
}

function selectionIsAllowed(selectionStart: Date, selectionEnd: Date, allDay?: boolean) {
  if (selectionStart < new Date()) return false
  if (allDay) return false

  if (isGuestSelectionMode.value) {
    const startLA = DateTime.fromJSDate(selectionStart, { zone: STUDIO_TZ })
    const endLA = DateTime.fromJSDate(selectionEnd, { zone: STUDIO_TZ })
    if (!startLA.hasSame(endLA, 'day')) return false

    if (guestBookingStartHour.value !== null && guestBookingEndHour.value !== null) {
      const startHourValue = toHourValue(startLA)
      const endHourValue = toHourValue(endLA)
      if (startHourValue < guestBookingStartHour.value || endHourValue > guestBookingEndHour.value) {
        return false
      }
    }

    const durationMinutes = endLA.diff(startLA, 'minutes').minutes
    const { minMinutes, increment } = getGuestSelectionPolicy()
    const startMinute = startLA.hour * 60 + startLA.minute
    const endMinute = endLA.hour * 60 + endLA.minute
    if (durationMinutes < minMinutes) return false
    if (durationMinutes % increment !== 0 || startMinute % increment !== 0 || endMinute % increment !== 0) {
      return false
    }
  }

  if (rangeOverlapsUnavailable(selectionStart, selectionEnd)) return false

  if (!bookingWindowDays.value) return true
  const maxStart = new Date(Date.now() + bookingWindowDays.value * 24 * 60 * 60 * 1000)
  return selectionStart <= maxStart
}

function emitCalendarSelection(start: Date, end: Date, allDay?: boolean) {
  const normalizedEnd = normalizeGuestSelectionEnd(start, end)
  if (!selectionIsAllowed(start, normalizedEnd, allDay)) return
  emit('select', {
    start,
    end: normalizedEnd,
    rateKind: isWithinStandbyWindow(start, normalizedEnd) ? 'standby' : 'standard'
  })
}

const calendarSnapDuration = computed(() => {
  if (!canSelect.value) return '01:00:00'
  if (isGuestConstrainedFeed.value) return minutesToDuration(guestBookingIncrementMinutes.value ?? 60)
  if (isMemberFeed.value) return '00:30:00'
  return '01:00:00'
})

const calendarSlotDuration = computed(() => {
  if (isGuestConstrainedFeed.value) return minutesToDuration(guestBookingIncrementMinutes.value ?? 60)
  if (isMemberFeed.value) return '00:30:00'
  return '01:00:00'
})

const calendarSlotLabelInterval = computed(() => {
  if (isMemberFeed.value) return '01:00:00'
  return '02:00:00'
})

const peakEvents = computed<CalendarEvent[]>(() => {
  if (!peakWindow.value) return []
  const days = (peakWindow.value.days ?? [])
    .map(day => Number(day))
    .filter(day => Number.isInteger(day) && day >= 1 && day <= 7)
  if (!days.length) return []

  return [
    {
      id: 'peak-window',
      title: 'Peak hours',
      display: 'background',
      daysOfWeek: days.map(day => day % 7),
      startTime: hourToTimeLabel(peakWindow.value.startHour),
      endTime: hourToTimeLabel(peakWindow.value.endHour),
      classNames: ['fc-peak-window']
    } as CalendarEvent
  ]
})

const pastBlackoutEvents = computed<CalendarEvent[]>(() => {
  const rangeStart = lastLoadRangeStart.value
  const rangeEnd = lastLoadRangeEnd.value
  if (!rangeStart || !rangeEnd) return []

  const rangeStartLa = DateTime.fromJSDate(calendarDateToStudioDate(rangeStart), { zone: 'utc' }).setZone(STUDIO_TZ)
  const rangeEndLa = DateTime.fromJSDate(calendarDateToStudioDate(rangeEnd), { zone: 'utc' }).setZone(STUDIO_TZ)
  const nowLa = DateTime.fromMillis(nowTickMs.value, { zone: STUDIO_TZ })
  if (nowLa <= rangeStartLa) return []

  const events: CalendarEvent[] = []
  const blackoutEnd = DateTime.min(nowLa, rangeEndLa)
  let cursor = rangeStartLa.startOf('day')

  while (cursor < blackoutEnd) {
    const segmentStart = cursor < rangeStartLa ? rangeStartLa : cursor
    const segmentEnd = DateTime.min(cursor.plus({ days: 1 }), blackoutEnd)
    if (segmentEnd > segmentStart) {
      events.push({
        id: `past-blackout-${cursor.toISODate()}`,
        title: 'Past',
        display: 'background',
        start: studioInstantToCalendarIso(segmentStart.toJSDate()),
        end: studioInstantToCalendarIso(segmentEnd.toJSDate()),
        classNames: ['fc-past-blackout'],
        extendedProps: { type: 'past-blackout' }
      })
    }
    cursor = cursor.plus({ days: 1 })
  }

  return events
})

const calendarEvents = computed<CalendarEvent[]>(() => [
  ...pastBlackoutEvents.value,
  ...activeEvents.value,
  ...peakEvents.value
])

const memberValidRange = computed(() => {
  if (!canSelect.value) return undefined
  const nowLa = DateTime.fromMillis(nowTickMs.value, { zone: STUDIO_TZ })
  const currentWeekStart = nowLa.startOf('day').minus({ days: nowLa.weekday % 7 })
  if (!bookingWindowDays.value) {
    return {
      start: studioInstantToCalendarIso(currentWeekStart.toJSDate())
    }
  }

  const end = nowLa.plus({ days: bookingWindowDays.value })
  return {
    start: studioInstantToCalendarIso(currentWeekStart.toJSDate()),
    end: studioInstantToCalendarIso(end.toJSDate())
  }
})

const calendarSlotMinTime = computed(() => {
  if (props.fullDay) return '00:00:00'
  if (!isGuestConstrainedFeed.value) return '00:00:00'
  if (guestBookingStartHour.value === null) return '00:00:00'
  return hourToTimeLabel(guestBookingStartHour.value)
})

const calendarSlotMaxTime = computed(() => {
  if (props.fullDay) return '24:00:00'
  if (!isGuestConstrainedFeed.value) return '24:00:00'
  if (guestBookingEndHour.value === null) return '24:00:00'
  return hourToTimeLabel(guestBookingEndHour.value)
})

const calendarOptions = computed(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
  initialView: defaultInitialView,
  timeZone: 'UTC',
  selectable: canSelect.value,
  validRange: memberValidRange.value,
  selectOverlap: (event: { display: string, classNames?: string[], extendedProps?: CalendarEvent['extendedProps'] }) => {
    // Allow selecting over visual-only peak/standby shading; keep real booking/hold/block overlaps blocked.
    if (
      event.display === 'background'
      && (
        (event.classNames ?? []).includes('fc-peak-window')
        || event.extendedProps?.type === 'standby'
        || event.extendedProps?.type === 'past-blackout'
      )
    ) return true
    if (event.extendedProps?.type === 'hold' && event.extendedProps?.isOwn) return true
    return false
  },
  selectAllow: (selectionInfo: { start: Date, end: Date, allDay?: boolean }) => {
    const selectionStart = calendarDateToStudioDate(selectionInfo.start)
    const selectionEnd = normalizeGuestSelectionEnd(selectionStart, calendarDateToStudioDate(selectionInfo.end))
    return selectionIsAllowed(selectionStart, selectionEnd, selectionInfo.allDay)
  },
  selectMirror: true,
  now: studioInstantToCalendarIso(new Date(nowTickMs.value)),
  nowIndicator: true,
  allDaySlot: false,
  height: isGuestConstrainedFeed.value ? 800 : 'auto',
  slotMinTime: calendarSlotMinTime.value,
  slotMaxTime: calendarSlotMaxTime.value,
  snapDuration: calendarSnapDuration.value,
  slotDuration: calendarSlotDuration.value,
  slotLabelInterval: calendarSlotLabelInterval.value,
  eventTimeFormat: {
    hour: 'numeric',
    minute: '2-digit',
    meridiem: 'short'
  } as const,
  expandRows: true,
  stickyHeaderDates: true,
  headerToolbar: {
    left: 'prev,next today',
    center: '',
    right: 'dayGridMonth,timeGridWeek,timeGridDay'
  },
  buttonText: {
    today: 'Today',
    dayGridMonth: 'Month',
    timeGridWeek: 'Week',
    timeGridDay: 'Day'
  },
  dayHeaderFormat,
  events: calendarEvents.value,
  eventClassNames,
  eventContent,
  eventDidMount,
  dateClick: (info: { view: { type: string, calendar: { changeView: (viewName: string, date: Date) => void } }, date: Date }) => {
    if (!canSelect.value) return
    if (info.view.type === 'dayGridMonth') {
      const calendar = info.view.calendar
      if (calendar) calendar.changeView('timeGridDay', info.date)
      return
    }
    if (!isGuestSelectionMode.value) return
    const start = calendarDateToStudioDate(info.date)
    emitCalendarSelection(start, start)
  },
  eventClick: (info: { event: { extendedProps?: CalendarEvent['extendedProps'], start: Date | null, end: Date | null } }) => {
    const ext = info.event.extendedProps
    const start = info.event.start ? calendarDateToStudioDate(info.event.start).toISOString() : null
    const end = info.event.end ? calendarDateToStudioDate(info.event.end).toISOString() : null
    if (props.adminView && ext?.type === 'block' && ext.blockId && start) {
      emit('block-click', {
        blockId: ext.blockId,
        start,
        end: end ?? start,
        notes: ext.notes
      })
      return
    }

    if (ext?.type !== 'booking' || !ext.isOwn || !ext.bookingId) return
    if (!start) return
    emit('booking-click', {
      bookingId: ext.bookingId,
      start,
      end: end ?? start,
      status: ext.status,
      rateKind: ext.rateKind,
      notes: ext.notes,
      paymentExpiresAt: ext.paymentExpiresAt ?? null
    })
  },
  select: (info: DateSelectArg) => {
    const start = calendarDateToStudioDate(info.start)
    emitCalendarSelection(start, calendarDateToStudioDate(info.end), info.allDay)
  },
  datesSet: (info: DatesSetArg) => {
    // Called when the visible range changes
    visibleTitle.value = info.view.title
    visibleRange.value = formatRange(info.start, info.end)
    loadEvents(info.start, info.end)
  }
}))

onMounted(() => {
  loadEvents()
  nowTickTimer = setInterval(() => {
    const nowMs = Date.now()
    nowTickMs.value = nowMs
    if (events.value.some(event => isExpiredPendingPaymentEvent(event, nowMs))) {
      void loadEvents(lastLoadRangeStart.value ?? undefined, lastLoadRangeEnd.value ?? undefined)
    }
  }, 60_000)
})

onUnmounted(() => {
  if (!nowTickTimer) return
  clearInterval(nowTickTimer)
  nowTickTimer = null
})
</script>

<template>
  <div
    class="availability-shell"
    :class="{
      'availability-shell--guest-compact': isGuestConstrainedFeed,
      'availability-shell--peak-highlight': peakZonesHighlighted,
      'availability-shell--standby-highlight': standbyZonesHighlighted
    }"
  >
    <div class="availability-toolbar">
      <div>
        <div class="studio-display text-2xl text-[color:var(--gruv-ink-0)]">
          {{ visibleTitle }}
        </div>
        <div class="text-sm text-[color:var(--gruv-ink-2)]">
          {{ visibleRangeLabel }}
        </div>
      </div>

      <div class="availability-meta">
        <div
          v-if="isMemberFeed && ownBookingCount"
          class="availability-chip availability-chip-own"
        >
          <span class="availability-dot availability-dot-own" />
          Owned bookings ({{ ownBookingCount }})
        </div>
        <div
          v-if="peakChip"
          class="availability-chip-popover-wrap"
        >
          <button
            type="button"
            class="availability-chip availability-chip-button availability-chip-peak"
            :aria-expanded="activeLegendPopup === 'peak'"
            @click="toggleLegendPopup('peak')"
            @mouseenter="peakZonesHighlighted = true"
            @mouseleave="peakZonesHighlighted = false"
            @focus="peakZonesHighlighted = true"
            @blur="peakZonesHighlighted = false"
            @keydown.escape="activeLegendPopup = null"
          >
            <span class="availability-dot availability-dot-peak" />
            {{ peakChip }}
            <UIcon
              name="i-lucide-info"
              class="size-3.5"
            />
          </button>
          <div
            v-if="activeLegendPopup === 'peak'"
            class="availability-chip-popover availability-chip-popover-peak"
          >
            <p class="text-xs font-semibold uppercase tracking-wide">
              Peak hours
            </p>
            <p class="mt-1 text-sm">
              {{ peakInfoLabel }}
            </p>
            <p class="mt-2 text-xs leading-5 text-dimmed">
              Time selected inside the orange peak zones uses the peak credit multiplier.
            </p>
          </div>
        </div>
        <div
          v-if="props.showStandbyBadge && standbyWindowCount"
          class="availability-chip-popover-wrap"
        >
          <button
            type="button"
            class="availability-chip availability-chip-button availability-chip-standby"
            :aria-expanded="activeLegendPopup === 'standby'"
            @click="toggleLegendPopup('standby')"
            @mouseenter="standbyZonesHighlighted = true"
            @mouseleave="standbyZonesHighlighted = false"
            @focus="standbyZonesHighlighted = true"
            @blur="standbyZonesHighlighted = false"
            @keydown.escape="activeLegendPopup = null"
          >
            <span class="availability-dot availability-dot-standby" />
            {{ standbyChipLabel ?? 'Standby available' }}
            <UIcon
              name="i-lucide-info"
              class="size-3.5"
            />
          </button>
          <div
            v-if="activeLegendPopup === 'standby'"
            class="availability-chip-popover availability-chip-popover-standby"
          >
            <p class="text-xs font-semibold uppercase tracking-wide">
              Standby
            </p>
            <p class="mt-1 text-sm">
              {{ standbyInfoLabel }}
            </p>
            <p class="mt-2 text-xs leading-5 text-dimmed">
              Standby is same-day discounted booking. Select a time fully inside the Stand By zone and meet the listed minimum to use the standby rate. Standby bookings cannot be held, canceled, rescheduled, extended, or chained more than once per day.
            </p>
          </div>
        </div>
        <div
          v-if="loading"
          class="availability-chip"
        >
          Refreshing schedule…
        </div>
        <div
          v-else-if="lastRefreshedAt"
          class="availability-chip"
        >
          Updated {{ lastRefreshedAt }}
        </div>
      </div>
    </div>

    <UAlert
      v-if="workshopPromo"
      class="mb-3"
      color="warning"
      variant="soft"
      icon="i-lucide-megaphone"
      :title="workshopPromo.title || 'Upcoming workshop'"
      :description="workshopPromo.description || undefined"
    >
      <template #actions>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            v-if="workshopPromoDateLabel"
            color="neutral"
            variant="soft"
            size="sm"
          >
            {{ workshopPromoDateLabel }}
          </UBadge>
          <UButton
            v-if="workshopPromo.link"
            color="warning"
            variant="soft"
            size="xs"
            :to="workshopPromo.link"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open workshop link
          </UButton>
        </div>
      </template>
    </UAlert>

    <div class="relative">
      <FullCalendar :options="calendarOptions" />

      <div
        v-if="loading"
        class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[1.25rem] bg-[rgba(250,241,224,0.58)] backdrop-blur-[1px] dark:bg-[rgba(40,40,40,0.45)]"
      >
        <div class="flex items-center gap-2 rounded-full bg-[color:var(--gruv-bg-0)] px-3 py-1.5 text-xs font-medium text-[color:var(--gruv-ink-1)] shadow-sm dark:bg-[color:var(--gruv-bg-0)]">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-4 animate-spin"
          />
          Loading bookings…
        </div>
      </div>
    </div>
  </div>
</template>
