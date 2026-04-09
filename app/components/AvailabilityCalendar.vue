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
    type?: 'booking' | 'hold' | 'external'
    isOwn?: boolean
    status?: string
    bookingId?: string
    notes?: string
    provider?: string
    location?: string
    isGuest?: boolean
    calendarId?: string
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

const props = withDefaults(defineProps<{
  endpoint: string // '/api/calendar/public' or '/api/calendar/member'
  fullDay?: boolean
  adminView?: boolean
}>(), {
  fullDay: false,
  adminView: false
})

const emit = defineEmits<{
  (e: 'select', payload: { start: Date, end: Date }): void
  (e: 'booking-click', payload: {
    bookingId: string
    start: string
    end: string
    status?: string
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
const peakWindow = ref<PeakWindow | null>(null)
const nowTickMs = ref(Date.now())
let nowTickTimer: ReturnType<typeof setInterval> | null = null
const instance = getCurrentInstance()
const STUDIO_TZ = 'America/Los_Angeles'

type CalendarResponse = {
  from?: string
  to?: string
  bookingWindowDays?: number
  guestBookingStartHour?: number
  guestBookingEndHour?: number
  peakWindow?: PeakWindow | null
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
    peakWindow.value = res.peakWindow ?? null
    lastRefreshedAt.value = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles'
    })
  } finally {
    loading.value = false
  }
}

const ownBookingCount = computed(() =>
  events.value.filter(event => event.extendedProps?.isOwn).length
)
const isMemberFeed = computed(() => props.endpoint.includes('/member'))
const isPublicFeed = computed(() => props.endpoint.includes('/public'))

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
  if (type === 'booking') {
    classes.push('fc-event-booked')
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
  const isOwnBooking = ext.type === 'booking' && ext.isOwn
  const isUnownedBooking = ext.type === 'booking' && !ext.isOwn
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
  if (isHold) {
    label = '<div class="fc-event-label">Equipement Hold</div>'
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

const visibleRangeLabel = computed(() => {
  if (isMemberFeed.value && bookingWindowDays.value) {
    return `${visibleRange.value} (${bookingWindowDays.value}-day booking reach)`
  }
  return visibleRange.value
})

function hourToTimeLabel(hour: number) {
  const safe = Math.max(0, Math.min(24, Math.floor(hour)))
  return `${safe.toString().padStart(2, '0')}:00:00`
}

function toHourValue(dateTime: DateTime) {
  return dateTime.hour + (dateTime.minute / 60) + (dateTime.second / 3600)
}

const calendarSnapDuration = computed(() => {
  if (!canSelect.value) return '01:00:00'
  if (isMemberFeed.value) return '00:30:00'
  return '01:00:00'
})

const calendarSlotDuration = computed(() => {
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

const calendarEvents = computed<CalendarEvent[]>(() => [
  ...events.value,
  ...peakEvents.value
])

const memberValidRange = computed(() => {
  if (!canSelect.value) return undefined
  const now = new Date()
  if (!bookingWindowDays.value) {
    return {
      start: studioInstantToCalendarIso(now)
    }
  }

  const end = new Date(now.getTime() + bookingWindowDays.value * 24 * 60 * 60 * 1000)
  return {
    start: studioInstantToCalendarIso(now),
    end: studioInstantToCalendarIso(end)
  }
})

const calendarSlotMinTime = computed(() => {
  if (props.fullDay) return '00:00:00'
  if (!isPublicFeed.value) return '00:00:00'
  if (guestBookingStartHour.value === null) return '00:00:00'
  return hourToTimeLabel(guestBookingStartHour.value)
})

const calendarSlotMaxTime = computed(() => {
  if (props.fullDay) return '24:00:00'
  if (!isPublicFeed.value) return '24:00:00'
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
    // Allow selecting over visual-only peak shading; keep real booking/hold overlaps blocked.
    if (event.display === 'background' && (event.classNames ?? []).includes('fc-peak-window')) return true
    if (event.extendedProps?.type === 'hold' && event.extendedProps?.isOwn) return true
    return false
  },
  selectAllow: (selectionInfo: { start: Date, end: Date, allDay?: boolean }) => {
    const selectionStart = calendarDateToStudioDate(selectionInfo.start)
    const selectionEnd = calendarDateToStudioDate(selectionInfo.end)
    if (selectionStart < new Date()) return false

    // In month view, require users to pick an actual time slot in day/week view.
    if (selectionInfo.allDay) return false

    if (isPublicFeed.value) {
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
    }

    if (!bookingWindowDays.value) return true
    const maxStart = new Date(Date.now() + bookingWindowDays.value * 24 * 60 * 60 * 1000)
    return selectionStart <= maxStart
  },
  selectMirror: true,
  now: studioInstantToCalendarIso(new Date(nowTickMs.value)),
  nowIndicator: true,
  allDaySlot: false,
  height: 'auto',
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
    if (info.view.type !== 'dayGridMonth') return
    const calendar = info.view.calendar
    if (calendar) calendar.changeView('timeGridDay', info.date)
  },
  eventClick: (info: { event: { extendedProps?: CalendarEvent['extendedProps'], start: Date | null, end: Date | null } }) => {
    const ext = info.event.extendedProps
    if (ext?.type !== 'booking' || !ext.isOwn || !ext.bookingId) return
    const start = info.event.start ? calendarDateToStudioDate(info.event.start).toISOString() : null
    const end = info.event.end ? calendarDateToStudioDate(info.event.end).toISOString() : null
    if (!start) return
    emit('booking-click', {
      bookingId: ext.bookingId,
      start,
      end: end ?? start,
      status: ext.status,
      notes: ext.notes
    })
  },
  select: (info: DateSelectArg) => {
    if (info.allDay) return
    const start = calendarDateToStudioDate(info.start)
    if (start < new Date()) return
    emit('select', {
      start,
      end: calendarDateToStudioDate(info.end)
    })
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
    nowTickMs.value = Date.now()
  }, 60_000)
})

onUnmounted(() => {
  if (!nowTickTimer) return
  clearInterval(nowTickTimer)
  nowTickTimer = null
})
</script>

<template>
  <div class="availability-shell">
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
          class="availability-chip availability-chip-peak"
        >
          <span class="availability-dot availability-dot-peak" />
          {{ peakChip }}
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
