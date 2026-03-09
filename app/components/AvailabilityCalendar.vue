<script setup lang="ts">
import type {
  DateSelectArg,
  DatesSetArg,
  EventInput
} from '@fullcalendar/core'
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
    type?: 'booking' | 'hold'
    isOwn?: boolean
    status?: string
    bookingId?: string
    notes?: string
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

const props = defineProps<{
  endpoint: string // '/api/calendar/public' or '/api/calendar/member'
}>()

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
const peakWindow = ref<PeakWindow | null>(null)
const instance = getCurrentInstance()

type CalendarResponse = {
  from?: string
  to?: string
  bookingWindowDays?: number
  peakWindow?: PeakWindow | null
  events: CalendarEvent[]
}

function formatRange(start: Date, end: Date) {
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Los_Angeles'
  })
  const endMinusTick = new Date(end.getTime() - 1)
  const endLabel = endMinusTick.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Los_Angeles'
  })
  return `${startLabel} to ${endLabel}`
}

async function loadEvents(rangeStart?: Date, rangeEnd?: Date) {
  loading.value = true
  try {
    const q: Record<string, string> = {}
    if (rangeStart) q.from = rangeStart.toISOString()
    if (rangeEnd) q.to = rangeEnd.toISOString()

    const res = await $fetch<CalendarResponse>(props.endpoint, { query: q })
    events.value = res.events ?? []
    bookingWindowDays.value = res.bookingWindowDays ?? null
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

const eventCount = computed(() => events.value.length)
const holdCount = computed(() =>
  events.value.filter(event => event.extendedProps?.type === 'hold').length
)
const bookingCount = computed(() =>
  events.value.filter(event => event.extendedProps?.type === 'booking').length
)
const ownBookingCount = computed(() =>
  events.value.filter(event => event.extendedProps?.isOwn).length
)
const isMemberFeed = computed(() => props.endpoint.includes('/member'))

function eventClassNames(arg: { event: { display: string, extendedProps: CalendarEvent['extendedProps'] } }) {
  const classes = ['fc-event-block']
  const type = arg.event.extendedProps?.type

  if (type === 'hold') classes.push('fc-event-hold')
  if (type === 'booking') classes.push('fc-event-booked')

  if (arg.event.extendedProps?.isOwn) {
    classes.push('fc-event-own')
  } else if (type === 'booking') {
    classes.push('fc-event-member')
  }

  return classes
}

function eventContent(arg: { event: { display: string, title: string }, timeText: string }) {
  if (arg.event.display === 'background') return undefined

  const time = arg.timeText ? `<div class="fc-event-time">${arg.timeText}</div>` : ''
  return {
    html: `<div class="fc-event-label">${arg.event.title}</div>${time}`
  }
}

const canSelect = computed(() => Boolean(instance?.vnode.props?.onSelect))
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

function hourToTimeLabel(hour: number) {
  const safe = Math.max(0, Math.min(24, Math.floor(hour)))
  return `${safe.toString().padStart(2, '0')}:00:00`
}

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

const calendarOptions = computed(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
  initialView: 'timeGridWeek',
  timeZone: 'America/Los_Angeles',
  selectable: canSelect.value,
  selectOverlap: false,
  selectMirror: true,
  nowIndicator: true,
  allDaySlot: false,
  height: 'auto',
  slotMinTime: '07:00:00',
  slotMaxTime: '22:00:00',
  slotDuration: '01:00:00',
  slotLabelInterval: '02:00:00',
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
  eventClick: (info: { event: { extendedProps?: CalendarEvent['extendedProps'], startStr: string, endStr: string | null } }) => {
    const ext = info.event.extendedProps
    if (ext?.type !== 'booking' || !ext.isOwn || !ext.bookingId) return
    emit('booking-click', {
      bookingId: ext.bookingId,
      start: info.event.startStr,
      end: info.event.endStr ?? info.event.startStr,
      status: ext.status,
      notes: ext.notes
    })
  },
  select: (info: DateSelectArg) => emit('select', { start: info.start, end: info.end }),
  datesSet: (info: DatesSetArg) => {
    // Called when the visible range changes
    visibleTitle.value = info.view.title
    visibleRange.value = formatRange(info.start, info.end)
    loadEvents(info.start, info.end)
  }
}))

onMounted(() => loadEvents())
</script>

<template>
  <div class="availability-shell">
    <div class="availability-toolbar">
      <div>
        <div class="studio-display text-2xl text-[color:var(--gruv-ink-0)]">
          {{ visibleTitle }}
        </div>
        <div class="text-sm text-[color:var(--gruv-ink-2)]">
          {{ visibleRange }}
        </div>
      </div>

      <div class="availability-meta">
        <div class="availability-chip">
          <span class="availability-dot bg-[color:var(--gruv-accent)]" />
          {{ holdCount }} hold window{{ holdCount === 1 ? '' : 's' }}
        </div>
        <div class="availability-chip">
          <span class="availability-dot bg-[color:var(--gruv-ink-2)]" />
          {{ bookingCount }} confirmed session{{ bookingCount === 1 ? '' : 's' }}
        </div>
        <div class="availability-chip">
          {{ eventCount }} blocked block{{ eventCount === 1 ? '' : 's' }}
        </div>
        <div
          v-if="isMemberFeed && bookingWindowDays"
          class="availability-chip"
        >
          {{ bookingWindowDays }}-day booking reach
        </div>
        <div
          v-if="isMemberFeed && ownBookingCount"
          class="availability-chip"
        >
          {{ ownBookingCount }} of yours on the board
        </div>
        <div
          v-if="peakChip"
          class="availability-chip availability-chip-peak"
        >
          <span class="availability-dot bg-[color:var(--gruv-accent)]" />
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

    <FullCalendar :options="calendarOptions" />
  </div>
</template>
