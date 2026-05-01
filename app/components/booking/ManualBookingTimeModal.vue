<script setup lang="ts">
import { DateTime } from 'luxon'

const STUDIO_TZ = 'America/Los_Angeles'

type TimeSlotItem = {
  label: string
  value: string
  minutes: number
}

type CalendarQueryValue = string | number | boolean | null | undefined

type CalendarEvent = {
  start?: string | Date
  end?: string | Date
  display?: string
  extendedProps?: {
    type?: string
    isOwn?: boolean
    status?: string
    bookingId?: string
    minOpenSlotHours?: number
  }
}

type CalendarLoadResponse = {
  bookingWindowDays?: number
  events?: CalendarEvent[]
}

type MonthCell = {
  key: string
  day: number
  status: 'clear' | 'medium' | 'heavy'
  selected: boolean
  disabled: boolean
  unavailableKind: 'past' | 'window' | 'full' | null
  openMinutes: number
  occupiedMinutes: number
  tooltip: string
}

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  description?: string
  startHour?: number
  endHour?: number
  incrementMinutes?: number
  minDurationMinutes?: number
  defaultDurationMinutes?: number
  submitLabel?: string
  calendarEndpoint?: string
  calendarQuery?: Record<string, CalendarQueryValue>
}>(), {
  title: 'Create booking',
  description: 'Choose a date and time instead of dragging on the calendar.',
  startHour: 0,
  endHour: 24,
  incrementMinutes: 30,
  minDurationMinutes: 30,
  defaultDurationMinutes: 60,
  submitLabel: 'Continue',
  calendarEndpoint: '',
  calendarQuery: () => ({})
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'submit', payload: { start: Date, end: Date, rateKind?: 'standard' | 'standby' }): void
}>()

const toast = useToast()
const form = reactive({
  date: '',
  startSlot: '',
  endSlot: ''
})

const availabilityLoading = ref(false)
const availabilityError = ref<string | null>(null)
const availabilityMonthCursor = ref<DateTime | null>(null)
const availabilityHintMonth = ref('')
const availabilityBookingWindowDays = ref<number | null>(null)
const dayOccupiedIntervals = ref<Record<string, Array<{ startMinute: number, endMinute: number }>>>({})
const dayStandbyIntervals = ref<Record<string, Array<{ startMinute: number, endMinute: number, minDurationMinutes: number }>>>({})
const dayOccupiedMinutes = ref<Record<string, number>>({})
const dayCycleIndex = ref<Record<string, number>>({})

const hasCalendarAvailability = computed(() => Boolean(props.calendarEndpoint))
const calendarQueryKey = computed(() => JSON.stringify(props.calendarQuery ?? {}))
const safeIncrementMinutes = computed(() => Math.max(15, Math.round(Number(props.incrementMinutes || 30))))
const safeMinDurationMinutes = computed(() => Math.max(safeIncrementMinutes.value, Math.round(Number(props.minDurationMinutes || safeIncrementMinutes.value))))
const safeDefaultDurationMinutes = computed(() => Math.max(safeMinDurationMinutes.value, Math.round(Number(props.defaultDurationMinutes || safeMinDurationMinutes.value))))
const startBoundaryMinutes = computed(() => Math.max(0, Math.min(1439, Math.round(Number(props.startHour ?? 0) * 60))))
const endBoundaryMinutes = computed(() => Math.max(startBoundaryMinutes.value + safeIncrementMinutes.value, Math.min(1440, Math.round(Number(props.endHour ?? 24) * 60))))
const bookingWindowDays = computed(() => Math.max(1, Number(availabilityBookingWindowDays.value ?? 30)))

function minutesToValue(minutes: number) {
  const safe = Math.max(0, Math.min(1440, Math.round(minutes)))
  const hour = Math.floor(safe / 60)
  const minute = safe % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function valueToMinutes(value: string) {
  const [hourRaw, minuteRaw] = value.split(':')
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return (hour * 60) + minute
}

function formatSlotLabel(minutes: number) {
  if (minutes === 1440) return '12:00 AM next day'
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return DateTime.fromObject({ hour, minute }, { zone: STUDIO_TZ }).toFormat('h:mm a')
}

function formatDateLabel(key: string) {
  const parsed = DateTime.fromFormat(key, 'yyyy-LL-dd', { zone: STUDIO_TZ })
  return parsed.isValid ? parsed.toFormat('EEE, LLL d') : key
}

function alignUp(minutes: number, increment: number) {
  return Math.ceil(minutes / increment) * increment
}

function toDayKey(dt: DateTime) {
  return dt.toFormat('yyyy-LL-dd')
}

function dayKeyToDateTime(key: string) {
  const parsed = DateTime.fromFormat(key, 'yyyy-LL-dd', { zone: STUDIO_TZ })
  return parsed.isValid ? parsed : null
}

function parseCalendarDateTime(value: string | Date | undefined) {
  if (!value) return null
  if (value instanceof Date) return DateTime.fromJSDate(value, { zone: 'utc' }).setZone(STUDIO_TZ)

  const asIso = DateTime.fromISO(value, { setZone: true })
  if (asIso.isValid) return asIso.setZone(STUDIO_TZ)

  const asSql = DateTime.fromSQL(value, { zone: 'utc' })
  if (asSql.isValid) return asSql.setZone(STUDIO_TZ)

  return null
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

  return windows
}

function isInsideBookingWindow(key: string) {
  const day = dayKeyToDateTime(key)
  if (!day) return false
  const nowLa = DateTime.now().setZone(STUDIO_TZ)
  const today = nowLa.startOf('day')
  const reachEnd = nowLa.plus({ days: bookingWindowDays.value }).endOf('day')
  const target = day.startOf('day')
  return target >= today && target <= reachEnd
}

function getBookableWindowsForDay(key: string, minLengthMinutes = safeIncrementMinutes.value, includePastTimes = false) {
  const day = dayKeyToDateTime(key)
  if (!day || !isInsideBookingWindow(key)) return []

  const nowLa = DateTime.now().setZone(STUDIO_TZ)
  const nowMinute = !includePastTimes && day.hasSame(nowLa, 'day')
    ? alignUp((nowLa.hour * 60) + nowLa.minute, safeIncrementMinutes.value)
    : 0

  return getOpenWindowsFromIntervals(dayOccupiedIntervals.value[key] ?? [])
    .map(window => ({
      startMinute: Math.max(window.startMinute, startBoundaryMinutes.value, nowMinute),
      endMinute: Math.min(window.endMinute, endBoundaryMinutes.value)
    }))
    .filter(window => window.endMinute - window.startMinute >= minLengthMinutes)
}

function possibleStartMinutesForDay(key: string, durationMinutes = safeMinDurationMinutes.value, includePastTimes = false) {
  const starts: number[] = []
  const increment = safeIncrementMinutes.value

  for (const window of getBookableWindowsForDay(key, durationMinutes, includePastTimes)) {
    const maxStart = window.endMinute - durationMinutes
    let slot = alignUp(window.startMinute, increment)
    while (slot <= maxStart) {
      starts.push(slot)
      slot += increment
    }
  }

  return Array.from(new Set(starts)).sort((a, b) => a - b)
}

function buildCalendarQuery(from: string, to: string) {
  const query: Record<string, string | number | boolean> = {
    from,
    to
  }

  for (const [key, value] of Object.entries(props.calendarQuery ?? {})) {
    if (value !== null && value !== undefined) query[key] = value
  }

  return query
}

function addIntervalByDay(
  target: Record<string, Array<{ startMinute: number, endMinute: number }>>,
  rawStart: DateTime,
  rawEnd: DateTime
) {
  let start = rawStart
  const end = rawEnd

  while (start < end) {
    const dayStart = start.startOf('day')
    const dayEnd = dayStart.plus({ days: 1 })
    const segmentEnd = end < dayEnd ? end : dayEnd
    const key = toDayKey(dayStart)
    const startMinute = Math.max(0, Math.round(start.diff(dayStart, 'minutes').minutes))
    const endMinute = Math.min(24 * 60, Math.round(segmentEnd.diff(dayStart, 'minutes').minutes))
    if (endMinute > startMinute) {
      if (!target[key]) target[key] = []
      target[key].push({ startMinute, endMinute })
    }
    start = segmentEnd
  }
}

function addStandbyIntervalByDay(
  target: Record<string, Array<{ startMinute: number, endMinute: number, minDurationMinutes: number }>>,
  rawStart: DateTime,
  rawEnd: DateTime,
  minDurationMinutes: number
) {
  let start = rawStart
  const end = rawEnd

  while (start < end) {
    const dayStart = start.startOf('day')
    const dayEnd = dayStart.plus({ days: 1 })
    const segmentEnd = end < dayEnd ? end : dayEnd
    const key = toDayKey(dayStart)
    const startMinute = Math.max(0, Math.round(start.diff(dayStart, 'minutes').minutes))
    const endMinute = Math.min(24 * 60, Math.round(segmentEnd.diff(dayStart, 'minutes').minutes))
    if (endMinute > startMinute) {
      if (!target[key]) target[key] = []
      target[key].push({ startMinute, endMinute, minDurationMinutes })
    }
    start = segmentEnd
  }
}

async function loadAvailabilityForCurrentMonth(force = false) {
  if (!hasCalendarAvailability.value || !props.open) return

  const monthStart = (availabilityMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ).startOf('month')).setZone(STUDIO_TZ).startOf('month')
  const monthKey = monthStart.toFormat('yyyy-LL')
  if (!force && availabilityHintMonth.value === monthKey) return

  availabilityLoading.value = true
  availabilityError.value = null

  try {
    const monthEndExclusive = monthStart.plus({ months: 1 })
    const res = await $fetch<CalendarLoadResponse>(props.calendarEndpoint, {
      query: buildCalendarQuery(
        monthStart.toUTC().toISO() ?? monthStart.toISO() ?? '',
        monthEndExclusive.toUTC().toISO() ?? monthEndExclusive.toISO() ?? ''
      )
    })

    availabilityBookingWindowDays.value = Math.max(1, Number(res.bookingWindowDays ?? availabilityBookingWindowDays.value ?? 30))

    const intervalsByDay: Record<string, Array<{ startMinute: number, endMinute: number }>> = {}
    const standbyByDay: Record<string, Array<{ startMinute: number, endMinute: number, minDurationMinutes: number }>> = {}
    for (const rawEvent of res.events ?? []) {
      const type = rawEvent.extendedProps?.type
      const start = parseCalendarDateTime(rawEvent.start)
      const end = parseCalendarDateTime(rawEvent.end)
      if (!start || !end || !start.isValid || !end.isValid || end <= start) continue

      if (type === 'standby') {
        const minDurationMinutes = Math.max(0, Number(rawEvent.extendedProps?.minOpenSlotHours ?? 4)) * 60
        addStandbyIntervalByDay(standbyByDay, start, end, minDurationMinutes)
        continue
      }

      const isOccupied = type === 'booking'
        || type === 'hold'
        || type === 'block'
        || type === 'external'
        || rawEvent.display === 'background'
      if (!isOccupied) continue

      addIntervalByDay(intervalsByDay, start, end)
    }

    const mergedByDay: Record<string, Array<{ startMinute: number, endMinute: number }>> = {}
    const occupiedByDay: Record<string, number> = {}
    for (const [key, intervals] of Object.entries(intervalsByDay)) {
      const merged = mergeIntervals(intervals)
      mergedByDay[key] = merged
      occupiedByDay[key] = merged.reduce((sum, interval) => sum + Math.max(0, interval.endMinute - interval.startMinute), 0)
    }

    dayOccupiedIntervals.value = mergedByDay
    dayStandbyIntervals.value = standbyByDay
    dayOccupiedMinutes.value = occupiedByDay
    availabilityHintMonth.value = monthKey
    syncSelectionToAvailability()
  } catch (error: unknown) {
    const maybe = error as { data?: { statusMessage?: string }, message?: string }
    availabilityError.value = maybe.data?.statusMessage ?? maybe.message ?? 'Could not load availability'
  } finally {
    availabilityLoading.value = false
  }
}

const slotItems = computed<TimeSlotItem[]>(() => {
  const items: TimeSlotItem[] = []
  const increment = safeIncrementMinutes.value
  const first = alignUp(startBoundaryMinutes.value, increment)
  for (let minutes = first; minutes <= endBoundaryMinutes.value; minutes += increment) {
    items.push({
      label: formatSlotLabel(minutes),
      value: minutesToValue(minutes),
      minutes
    })
  }
  return items
})

const selectedDayKey = computed(() => form.date || null)

const startSlotItems = computed(() => {
  const key = selectedDayKey.value
  if (!hasCalendarAvailability.value || !key) {
    return slotItems.value
      .filter(item => item.minutes + safeMinDurationMinutes.value <= endBoundaryMinutes.value)
      .map(({ label, value }) => ({ label, value }))
  }

  return possibleStartMinutesForDay(key)
    .map(minutes => ({
      label: formatSlotLabel(minutes),
      value: minutesToValue(minutes)
    }))
})

const selectedStartSlot = computed(() =>
  slotItems.value.find(item => item.value === form.startSlot) ?? null
)

const endSlotItems = computed(() => {
  const start = selectedStartSlot.value
  if (!start) return []

  if (!hasCalendarAvailability.value || !selectedDayKey.value) {
    const minEnd = start.minutes + safeMinDurationMinutes.value
    return slotItems.value
      .filter(item => item.minutes >= minEnd && item.minutes <= endBoundaryMinutes.value)
      .map(({ label, value }) => ({ label, value }))
  }

  const containingWindow = getBookableWindowsForDay(selectedDayKey.value, safeMinDurationMinutes.value)
    .find(window => start.minutes >= window.startMinute && start.minutes < window.endMinute)
  if (!containingWindow) return []

  const items: Array<{ label: string, value: string }> = []
  const increment = safeIncrementMinutes.value
  let minutes = alignUp(start.minutes + safeMinDurationMinutes.value, increment)
  while (minutes <= containingWindow.endMinute) {
    items.push({
      label: formatSlotLabel(minutes),
      value: minutesToValue(minutes)
    })
    minutes += increment
  }
  return items
})

const selectedDateLabel = computed(() =>
  selectedDayKey.value ? formatDateLabel(selectedDayKey.value) : 'No date selected'
)

const selectedDayFitWindows = computed(() => {
  const key = selectedDayKey.value
  if (!key) return []
  return getBookableWindowsForDay(key, safeMinDurationMinutes.value)
})

const availabilityMonthLabel = computed(() => {
  const cursor = availabilityMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)
  return cursor.toFormat('LLLL yyyy')
})

const canGoToPrevMonth = computed(() => {
  const cursor = (availabilityMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)).startOf('month')
  const currentMonth = DateTime.now().setZone(STUDIO_TZ).startOf('month')
  return cursor > currentMonth
})

const canGoToNextMonth = computed(() => {
  const cursor = (availabilityMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)).startOf('month')
  const reachMonth = DateTime.now().setZone(STUDIO_TZ).plus({ days: bookingWindowDays.value }).startOf('month')
  return cursor < reachMonth
})

const availabilityMonthCells = computed<Array<MonthCell | null>>(() => {
  const cursor = (availabilityMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)).setZone(STUDIO_TZ).startOf('month')
  const monthEnd = cursor.endOf('month')
  const leading = cursor.weekday % 7
  const cells: Array<MonthCell | null> = []
  const nowLa = DateTime.now().setZone(STUDIO_TZ)
  const today = nowLa.startOf('day')

  for (let i = 0; i < leading; i++) cells.push(null)

  let day = cursor
  while (day <= monthEnd) {
    const key = toDayKey(day)
    const occupiedMinutes = Number(dayOccupiedMinutes.value[key] ?? 0)
    const openWindows = getBookableWindowsForDay(key, safeMinDurationMinutes.value)
    const openMinutes = openWindows.reduce((sum, window) => sum + Math.max(0, window.endMinute - window.startMinute), 0)
    const possibleStarts = possibleStartMinutesForDay(key)
    const possibleStartsIncludingPast = possibleStartMinutesForDay(key, safeMinDurationMinutes.value, true)
    const disabled = possibleStarts.length === 0
    const isPastDay = day.startOf('day') < today
    let unavailableKind: MonthCell['unavailableKind'] = null
    if (disabled) {
      if (isPastDay || (day.hasSame(nowLa, 'day') && possibleStartsIncludingPast.length > 0)) {
        unavailableKind = 'past'
      } else if (!isInsideBookingWindow(key)) {
        unavailableKind = 'window'
      } else {
        unavailableKind = 'full'
      }
    }
    const status: MonthCell['status'] = occupiedMinutes === 0
      ? 'clear'
      : occupiedMinutes >= 10 * 60
        ? 'heavy'
        : 'medium'

    cells.push({
      key,
      day: day.day,
      status,
      selected: selectedDayKey.value === key,
      disabled,
      unavailableKind,
      occupiedMinutes,
      openMinutes,
      tooltip: disabled
        ? unavailableKind === 'past'
          ? `${formatDateLabel(key)} is no longer available for new bookings`
          : unavailableKind === 'window'
            ? `${formatDateLabel(key)} is outside your booking window`
            : `${formatDateLabel(key)} has no available ${safeMinDurationMinutes.value}-minute windows`
        : `${formatDateLabel(key)} has ${Math.round(openMinutes / 60 * 10) / 10} open hours`
    })
    day = day.plus({ days: 1 })
  }

  return cells
})

const selectedRangeValidationMessage = computed(() => {
  const startMinutes = valueToMinutes(form.startSlot)
  const endMinutes = valueToMinutes(form.endSlot)
  if (!form.date || startMinutes === null || endMinutes === null) return 'Choose a date, start time, and end time.'
  if (endMinutes <= startMinutes) return 'End time must be after start time.'
  if (endMinutes - startMinutes < safeMinDurationMinutes.value) return `Minimum duration is ${safeMinDurationMinutes.value} minutes.`

  const dayStart = DateTime.fromISO(form.date, { zone: STUDIO_TZ }).startOf('day')
  const start = dayStart.plus({ minutes: startMinutes })
  if (!start.isValid || start < DateTime.now().setZone(STUDIO_TZ)) return 'Bookings must start in the future.'

  if (hasCalendarAvailability.value) {
    if (availabilityLoading.value) return 'Availability is still loading.'
    if (availabilityError.value) return availabilityError.value
    const fits = getBookableWindowsForDay(form.date, endMinutes - startMinutes)
      .some(window => startMinutes >= window.startMinute && endMinutes <= window.endMinute)
    if (!fits) return 'Selected time is outside the booking window or conflicts with existing availability.'
  }

  return null
})

const canSubmit = computed(() => !selectedRangeValidationMessage.value)

function selectionRateKind(key: string, startMinute: number, endMinute: number): 'standard' | 'standby' {
  const durationMinutes = endMinute - startMinute
  return (dayStandbyIntervals.value[key] ?? []).some(interval =>
    startMinute >= interval.startMinute && endMinute <= interval.endMinute
    && durationMinutes >= interval.minDurationMinutes
  )
    ? 'standby'
    : 'standard'
}

function applyDefaultEnd() {
  const start = selectedStartSlot.value
  if (!start) {
    form.endSlot = ''
    return
  }

  const options = endSlotItems.value
  if (!options.length) {
    form.endSlot = ''
    return
  }

  const preferredEnd = Math.min(endBoundaryMinutes.value, start.minutes + safeDefaultDurationMinutes.value)
  const nextEnd = options.find((option) => {
    const minutes = valueToMinutes(option.value)
    return minutes !== null && minutes >= preferredEnd
  }) ?? options[0]

  form.endSlot = nextEnd?.value ?? ''
}

function selectFirstAvailableTimeForDay(key: string, cycle = false) {
  const starts = possibleStartMinutesForDay(key)
  if (!starts.length) {
    form.startSlot = ''
    form.endSlot = ''
    return
  }

  let index = 0
  if (cycle) {
    index = ((dayCycleIndex.value[key] ?? 0) + 1) % starts.length
  }
  dayCycleIndex.value[key] = index
  form.startSlot = minutesToValue(starts[index] ?? starts[0] ?? startBoundaryMinutes.value)
  applyDefaultEnd()
}

function syncSelectionToAvailability() {
  if (!props.open) return

  if (hasCalendarAvailability.value) {
    const currentValid = form.date && possibleStartMinutesForDay(form.date).length > 0
    if (!currentValid) {
      const firstAvailable = availabilityMonthCells.value.find((cell): cell is MonthCell => Boolean(cell && !cell.disabled))
      if (firstAvailable) {
        form.date = firstAvailable.key
        selectFirstAvailableTimeForDay(firstAvailable.key)
      } else {
        form.startSlot = ''
        form.endSlot = ''
      }
      return
    }
  }

  if (!startSlotItems.value.some(option => option.value === form.startSlot)) {
    form.startSlot = startSlotItems.value[0]?.value ?? ''
  }

  if (!endSlotItems.value.some(option => option.value === form.endSlot)) {
    applyDefaultEnd()
  }
}

function initializeForm() {
  const now = DateTime.now().setZone(STUDIO_TZ)
  const increment = safeIncrementMinutes.value
  let date = now
  let startMinutes = alignUp((now.hour * 60) + now.minute, increment)

  if (startMinutes < startBoundaryMinutes.value) startMinutes = startBoundaryMinutes.value
  if (startMinutes + safeMinDurationMinutes.value > endBoundaryMinutes.value) {
    date = now.plus({ days: 1 })
    startMinutes = startBoundaryMinutes.value
  }

  startMinutes = alignUp(startMinutes, increment)
  form.date = date.toISODate() ?? ''
  availabilityMonthCursor.value = date.startOf('month')
  dayCycleIndex.value = {}

  const firstAvailable = slotItems.value.find(item => item.minutes >= startMinutes && item.minutes + safeMinDurationMinutes.value <= endBoundaryMinutes.value)
    ?? slotItems.value.find(item => item.minutes + safeMinDurationMinutes.value <= endBoundaryMinutes.value)
    ?? null

  form.startSlot = firstAvailable?.value ?? ''
  applyDefaultEnd()
  if (hasCalendarAvailability.value) {
    void loadAvailabilityForCurrentMonth(true)
  } else {
    syncSelectionToAvailability()
  }
}

function close() {
  emit('update:open', false)
}

function submit() {
  const validationMessage = selectedRangeValidationMessage.value
  if (validationMessage) {
    toast.add({
      title: 'Choose an available time',
      description: validationMessage,
      color: 'warning'
    })
    return
  }

  const startMinutes = valueToMinutes(form.startSlot)
  const endMinutes = valueToMinutes(form.endSlot)
  if (!form.date || startMinutes === null || endMinutes === null) return

  const dayStart = DateTime.fromISO(form.date, { zone: STUDIO_TZ }).startOf('day')
  const start = dayStart.plus({ minutes: startMinutes })
  const end = dayStart.plus({ minutes: endMinutes })
  if (!start.isValid || !end.isValid || end <= start) {
    toast.add({
      title: 'Choose a valid time',
      description: 'The selected booking window could not be parsed.',
      color: 'warning'
    })
    return
  }

  emit('update:open', false)
  emit('submit', {
    start: start.toJSDate(),
    end: end.toJSDate(),
    rateKind: selectionRateKind(form.date, startMinutes, endMinutes)
  })
}

function applyCalendarDay(key: string) {
  const starts = possibleStartMinutesForDay(key)
  if (!starts.length) return

  const cycle = form.date === key
  form.date = key
  selectFirstAvailableTimeForDay(key, cycle)
}

function goToPrevMonth() {
  if (!canGoToPrevMonth.value) return
  const cursor = availabilityMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)
  availabilityMonthCursor.value = cursor.minus({ months: 1 }).startOf('month')
}

function goToNextMonth() {
  if (!canGoToNextMonth.value) return
  const cursor = availabilityMonthCursor.value ?? DateTime.now().setZone(STUDIO_TZ)
  availabilityMonthCursor.value = cursor.plus({ months: 1 }).startOf('month')
}

watch(() => props.open, (open) => {
  if (open) initializeForm()
})

watch(() => form.date, (date) => {
  if (!date) return
  const parsed = DateTime.fromISO(date, { zone: STUDIO_TZ })
  if (!parsed.isValid) return
  const month = parsed.startOf('month')
  const current = availabilityMonthCursor.value
  if (!current || current.toFormat('yyyy-LL') !== month.toFormat('yyyy-LL')) {
    availabilityMonthCursor.value = month
  }
  syncSelectionToAvailability()
})

watch(() => form.startSlot, () => {
  applyDefaultEnd()
})

watch(() => availabilityMonthCursor.value?.toFormat('yyyy-LL') ?? '', () => {
  if (props.open && hasCalendarAvailability.value) void loadAvailabilityForCurrentMonth()
})

watch(calendarQueryKey, () => {
  availabilityHintMonth.value = ''
  if (props.open && hasCalendarAvailability.value) void loadAvailabilityForCurrentMonth(true)
})

watch([
  safeIncrementMinutes,
  safeMinDurationMinutes,
  safeDefaultDurationMinutes,
  startBoundaryMinutes,
  endBoundaryMinutes
], () => {
  if (props.open) initializeForm()
})
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <UCard
        class="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-h-[calc(100dvh-4rem)]"
        :ui="{ body: 'min-h-0 overflow-y-auto' }"
      >
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold">
                {{ title }}
              </h3>
              <p class="mt-1 text-xs text-dimmed">
                {{ description }}
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="close"
            />
          </div>
        </template>

        <div class="space-y-4 pr-1">
          <div
            v-if="hasCalendarAvailability"
            class="space-y-3 rounded-lg border border-default bg-muted/30 p-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-medium">
                  Availability
                </p>
                <p class="text-xs text-dimmed">
                  Blacked-out days are in the past. Slashed days cannot fit this booking length or are outside your booking window.
                </p>
              </div>
              <div class="flex items-center gap-1.5">
                <UButton
                  icon="i-lucide-chevron-left"
                  color="neutral"
                  variant="soft"
                  size="xs"
                  :disabled="!canGoToPrevMonth"
                  @click="goToPrevMonth"
                />
                <span class="min-w-28 text-center text-xs font-medium">
                  {{ availabilityMonthLabel }}
                </span>
                <UButton
                  icon="i-lucide-chevron-right"
                  color="neutral"
                  variant="soft"
                  size="xs"
                  :disabled="!canGoToNextMonth"
                  @click="goToNextMonth"
                />
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3 text-xs text-dimmed">
              <span class="inline-flex items-center gap-1.5">
                <span class="size-2 rounded-full border border-default" />
                Clear
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="size-2 rounded-full bg-amber-500" />
                Busy
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="size-2 rounded-full bg-red-500" />
                Heavy
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span class="size-2 rounded-sm bg-black opacity-80 ring ring-black/10 dark:ring-white/20" />
                Past
              </span>
            </div>

            <p
              v-if="availabilityLoading"
              class="text-xs text-dimmed"
            >
              Refreshing availability...
            </p>
            <p
              v-if="availabilityError"
              class="text-xs text-red-500 dark:text-red-400"
            >
              {{ availabilityError }}
            </p>

            <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-dimmed">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>
            <div class="relative">
              <div
                class="grid grid-cols-7 gap-1.5 transition-opacity"
                :class="availabilityLoading ? 'opacity-70' : 'opacity-100'"
              >
                <button
                  v-for="(cell, idx) in availabilityMonthCells"
                  :key="cell?.key ?? `blank-${idx}`"
                  type="button"
                  class="relative h-9 rounded-md border text-xs transition"
                  :title="cell?.tooltip"
                  :class="cell
                    ? (cell.selected
                      ? (cell.disabled
                        ? (cell.unavailableKind === 'past' ? 'border-black bg-black text-white/60 opacity-80 dark:border-white/20 dark:bg-black dark:text-white/60' : 'border-black bg-black text-white/50')
                        : 'border-primary bg-primary/10 text-primary')
                      : (cell.disabled
                        ? (cell.unavailableKind === 'past' ? 'border-black bg-black text-white/60 opacity-80 dark:border-white/20 dark:bg-black dark:text-white/60' : 'border-muted bg-muted text-dimmed')
                        : 'border-default bg-default hover:bg-elevated'))
                    : 'pointer-events-none border-transparent opacity-0'"
                  :disabled="!cell || cell.disabled"
                  @click="cell && applyCalendarDay(cell.key)"
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
                    v-if="cell?.disabled && cell.unavailableKind !== 'past'"
                    class="pointer-events-none absolute inset-0"
                  >
                    <span class="absolute left-1 right-1 top-1/2 -translate-y-1/2 rotate-[-20deg] border-t border-dimmed" />
                  </span>
                </button>
              </div>
            </div>

            <div class="space-y-1">
              <p class="text-xs font-medium">
                {{ selectedDateLabel }}
              </p>
              <p
                v-if="!selectedDayFitWindows.length"
                class="text-xs text-dimmed"
              >
                No open windows can fit {{ safeMinDurationMinutes }} minutes.
              </p>
              <p
                v-else
                class="text-xs text-dimmed"
              >
                {{ selectedDayFitWindows.slice(0, 4).map(window => `${formatSlotLabel(window.startMinute)} to ${formatSlotLabel(window.endMinute)}`).join(' · ') }}
              </p>
            </div>
          </div>

          <UFormField
            v-else
            label="Date (Los Angeles)"
          >
            <UInput
              v-model="form.date"
              type="date"
            />
          </UFormField>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField :label="`Start time (${safeIncrementMinutes}-min)`">
              <USelect
                v-model="form.startSlot"
                :items="startSlotItems"
                :disabled="hasCalendarAvailability && (!form.date || availabilityLoading || !startSlotItems.length)"
                placeholder="Select start time"
              />
            </UFormField>

            <UFormField :label="`End time (${safeIncrementMinutes}-min)`">
              <USelect
                v-model="form.endSlot"
                :items="endSlotItems"
                :disabled="!form.startSlot || availabilityLoading || !endSlotItems.length"
                placeholder="Select end time"
              />
            </UFormField>
          </div>

          <p
            v-if="selectedRangeValidationMessage"
            class="text-xs text-amber-600 dark:text-amber-300"
          >
            {{ selectedRangeValidationMessage }}
          </p>
          <p
            v-else
            class="text-xs text-dimmed"
          >
            Times are in Los Angeles. This selection has already been checked against the loaded booking window and availability, then the server will verify credits and account policy before confirmation.
          </p>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              @click="close"
            >
              Cancel
            </UButton>
            <UButton
              :disabled="!canSubmit"
              @click="submit"
            >
              {{ submitLabel }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
