import { DateTime } from 'luxon'

type AdminBookingHold = {
  id: string
  hold_start: string
  hold_end: string
  hold_type: string
}

export type AdminBookingForReschedule = {
  id: string
  start_time: string
  end_time: string
  notes: string | null
  booking_holds?: AdminBookingHold[] | null
}

type UseAdminBookingRescheduleOptions = {
  onSaved: () => Promise<void> | void
}

type BookingPolicy = {
  holdCreditCost?: number
  minHoldBookingHours?: number
  holdMinEndHour?: number
  holdEndHour?: number
}

type AdminCalendarBooking = {
  id: string
  start_time: string
  end_time: string
  status: string
  user_id: string | null
  booking_holds?: AdminBookingHold[] | null
}

type CalendarBlock = {
  id: string
  start_time: string
  end_time: string
  active: boolean
}

type DayCell = {
  key: string
  day: number
  status: 'clear' | 'medium' | 'heavy'
  selected: boolean
  disabled: boolean
}

export function useAdminBookingReschedule(options: UseAdminBookingRescheduleOptions) {
  const toast = useToast()
  const STUDIO_TZ = 'America/Los_Angeles'
  const reschedulingId = ref<string | null>(null)
  const rescheduleOpen = ref(false)
  const rescheduleDurationMinutes = ref(0)
  const rescheduleAutoSyncEnd = ref(true)
  const rescheduleHintsLoading = ref(false)
  const rescheduleHintsError = ref<string | null>(null)
  const rescheduleHintMonth = ref<string>('')
  const rescheduleMonthCursor = ref<DateTime | null>(null)
  const rescheduleDayCycleIndex = ref<Record<string, number>>({})
  const reschedulePreferredStartMinute = ref<number | null>(null)
  const dayOccupiedMinutes = ref<Record<string, number>>({})
  const dayOccupiedIntervals = ref<Record<string, Array<{ startMinute: number, endMinute: number }>>>({})

  const rescheduleForm = reactive({
    bookingId: '' as string,
    startTime: '',
    endTime: '',
    notes: '' as string,
    hadHold: false,
    keepHold: false
  })

  const { data: bookingPolicy } = useAsyncData('admin:bookings:policy', async () => {
    return await $fetch<BookingPolicy>('/api/bookings/policy')
  })
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

  function toLocalInputValue(value: string | null | undefined) {
    if (!value) return ''
    const parsedIso = DateTime.fromISO(value, { setZone: true })
    if (parsedIso.isValid) return parsedIso.setZone(STUDIO_TZ).toFormat("yyyy-LL-dd'T'HH:mm")
    const parsedSql = DateTime.fromSQL(value, { zone: 'utc' })
    if (parsedSql.isValid) return parsedSql.setZone(STUDIO_TZ).toFormat("yyyy-LL-dd'T'HH:mm")
    return ''
  }

  function localInputToDateTime(value: string | null | undefined) {
    if (!value) return null
    const parsed = DateTime.fromFormat(value, "yyyy-LL-dd'T'HH:mm", { zone: STUDIO_TZ })
    if (parsed.isValid) return parsed
    const fallback = DateTime.fromISO(value, { zone: STUDIO_TZ })
    return fallback.isValid ? fallback : null
  }

  function fromLocalInputValue(value: string) {
    if (!value.trim()) return null
    const dt = DateTime.fromFormat(value, "yyyy-LL-dd'T'HH:mm", { zone: STUDIO_TZ })
    if (!dt.isValid) return null
    return dt.toUTC().toISO()
  }

  function hasHold(booking: AdminBookingForReschedule) {
    return (booking.booking_holds?.length ?? 0) > 0
  }

  function readErrorMessage(error: unknown) {
    if (!error || typeof error !== 'object') return 'Unknown error'
    const maybe = error as { data?: { statusMessage?: string }, message?: string }
    return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
  }

  function openReschedule(booking: AdminBookingForReschedule) {
    rescheduleForm.bookingId = booking.id
    rescheduleForm.startTime = toLocalInputValue(booking.start_time)
    rescheduleForm.endTime = toLocalInputValue(booking.end_time)
    rescheduleForm.notes = booking.notes ?? ''
    rescheduleForm.hadHold = hasHold(booking)
    rescheduleForm.keepHold = rescheduleForm.hadHold
    const startMs = new Date(booking.start_time).getTime()
    const endMs = new Date(booking.end_time).getTime()
    const duration = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 60000)) : 0
    rescheduleDurationMinutes.value = duration > 0 ? duration : 60
    const startDt = DateTime.fromISO(booking.start_time, { setZone: true }).setZone(STUDIO_TZ)
    reschedulePreferredStartMinute.value = startDt.isValid ? (startDt.hour * 60 + startDt.minute) : null
    rescheduleAutoSyncEnd.value = true
    rescheduleDayCycleIndex.value = {}
    const cursor = localInputToDateTime(rescheduleForm.startTime)?.setZone(STUDIO_TZ) ?? DateTime.now().setZone(STUDIO_TZ)
    rescheduleMonthCursor.value = cursor.startOf('month')
    void loadRescheduleMonthHints(rescheduleForm.startTime)
    rescheduleOpen.value = true
  }

  function closeReschedule() {
    if (reschedulingId.value) return
    rescheduleOpen.value = false
    rescheduleForm.bookingId = ''
    rescheduleForm.startTime = ''
    rescheduleForm.endTime = ''
    rescheduleForm.notes = ''
    rescheduleForm.hadHold = false
    rescheduleForm.keepHold = false
    rescheduleDurationMinutes.value = 0
    rescheduleAutoSyncEnd.value = true
    rescheduleHintsLoading.value = false
    rescheduleHintsError.value = null
    rescheduleHintMonth.value = ''
    rescheduleMonthCursor.value = null
    rescheduleDayCycleIndex.value = {}
    reschedulePreferredStartMinute.value = null
    dayOccupiedMinutes.value = {}
    dayOccupiedIntervals.value = {}
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

  function toDayKey(dt: DateTime) {
    return dt.toFormat('yyyy-LL-dd')
  }

  function dayKeyToDateTime(key: string) {
    const parsed = DateTime.fromFormat(key, 'yyyy-LL-dd', { zone: STUDIO_TZ })
    return parsed.isValid ? parsed : null
  }

  function getOpenWindowsForDay(key: string) {
    const intervals = dayOccupiedIntervals.value[key] ?? []
    if (!intervals.length) return [{ startMinute: 0, endMinute: 24 * 60 }]
    const windows: Array<{ startMinute: number, endMinute: number }> = []
    let cursor = 0
    for (const interval of intervals) {
      if (interval.startMinute > cursor) windows.push({ startMinute: cursor, endMinute: interval.startMinute })
      cursor = Math.max(cursor, interval.endMinute)
    }
    if (cursor < 24 * 60) windows.push({ startMinute: cursor, endMinute: 24 * 60 })
    return windows.filter(window => (window.endMinute - window.startMinute) >= 30)
  }

  function minuteToAligned30(minute: number) {
    return Math.ceil(minute / 30) * 30
  }

  function computeHoldEndFromBookingEnd(bookingEnd: DateTime) {
    const nextDay = bookingEnd.plus({ days: 1 }).startOf('day')
    return nextDay.set({ hour: holdEndHour.value, minute: 0, second: 0, millisecond: 0 })
  }

  function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
    return startA < endB && endA > startB
  }

  function canFitHoldWindowForStart(dayKey: string, startMinute: number, durationMinutes: number) {
    if (!rescheduleForm.keepHold || !rescheduleForm.hadHold) return true
    const day = dayKeyToDateTime(dayKey)
    if (!day) return false
    const bookingStart = day.plus({ minutes: startMinute })
    const bookingEnd = bookingStart.plus({ minutes: durationMinutes })
    const durationHours = bookingEnd.diff(bookingStart, 'hours').hours
    if (durationHours < minHoldBookingHours.value) return false
    const requiredEnd = bookingEnd.startOf('day').set({ hour: holdMinEndHour.value, minute: 0, second: 0, millisecond: 0 })
    if (bookingEnd < requiredEnd) return false
    const holdStart = bookingEnd
    const holdEnd = computeHoldEndFromBookingEnd(bookingEnd)
    if (!(holdEnd > holdStart)) return false

    let cursor = holdStart
    while (cursor < holdEnd) {
      const dayStart = cursor.startOf('day')
      const dayEnd = dayStart.plus({ days: 1 })
      const segmentEnd = holdEnd < dayEnd ? holdEnd : dayEnd
      const key = toDayKey(dayStart)
      const intervals = dayOccupiedIntervals.value[key] ?? []
      const segmentStartMinute = Math.max(0, Math.round(cursor.diff(dayStart, 'minutes').minutes))
      const segmentEndMinute = Math.min(24 * 60, Math.round(segmentEnd.diff(dayStart, 'minutes').minutes))
      if (intervals.some(interval => rangesOverlap(segmentStartMinute, segmentEndMinute, interval.startMinute, interval.endMinute))) {
        return false
      }
      cursor = segmentEnd
    }

    return true
  }

  function possibleStartMinutesForDay(key: string) {
    const windows = getOpenWindowsForDay(key)
    const duration = Math.max(1, rescheduleDurationMinutes.value || 60)
    const day = dayKeyToDateTime(key)
    const nowLa = DateTime.now().setZone(STUDIO_TZ)
    const nowMinute = day && day.hasSame(nowLa, 'day') ? (nowLa.hour * 60 + nowLa.minute) : 0
    const starts: number[] = []

    for (const window of windows) {
      const minStart = Math.max(window.startMinute, nowMinute)
      const maxStart = window.endMinute - duration
      if (maxStart < minStart) continue
      let slot = minuteToAligned30(minStart)
      if (slot > maxStart && minStart <= maxStart) slot = minStart
      while (slot <= maxStart) {
        starts.push(slot)
        slot += 30
      }
      const fallback = maxStart
      if (fallback >= minStart && !starts.includes(fallback)) starts.push(fallback)
    }

    const unique = Array.from(new Set(starts)).sort((a, b) => a - b)
    return unique.filter((minute) => canFitHoldWindowForStart(key, minute, duration))
  }

  function toLocalInputForDayMinute(key: string, minute: number) {
    const day = dayKeyToDateTime(key)
    if (!day) return ''
    return day.plus({ minutes: minute }).toFormat("yyyy-LL-dd'T'HH:mm")
  }

  async function loadRescheduleMonthHints(anchorInput: string) {
    const anchor = localInputToDateTime(anchorInput)?.setZone(STUDIO_TZ) ?? DateTime.now().setZone(STUDIO_TZ)
    const monthStart = (rescheduleMonthCursor.value ?? anchor.startOf('month')).setZone(STUDIO_TZ).startOf('month')
    const monthEnd = monthStart.endOf('month')
    const monthKey = monthStart.toFormat('yyyy-LL')
    if (rescheduleHintMonth.value === monthKey && Object.keys(dayOccupiedMinutes.value).length > 0) return

    rescheduleHintsLoading.value = true
    rescheduleHintsError.value = null
    try {
      const monthFromIso = monthStart.toUTC().toISO()
      const monthToIso = monthEnd.toUTC().toISO()
      if (!monthFromIso || !monthToIso) throw new Error('Invalid month window')

      const [bookingsRes, blocksRes] = await Promise.all([
        $fetch<{ bookings: AdminCalendarBooking[] }>('/api/admin/bookings', {
          query: { from: monthFromIso, to: monthToIso, limit: 300 }
        }),
        $fetch<{ blocks: CalendarBlock[] }>('/api/admin/calendar/blocks')
      ])

      const intervalsByDay: Record<string, Array<{ startMinute: number, endMinute: number }>> = {}
      const targetBookingId = rescheduleForm.bookingId
      const statuses = new Set(['confirmed', 'requested', 'pending_payment'])

      for (const booking of bookingsRes.bookings ?? []) {
        if (booking.id === targetBookingId) continue
        if (!statuses.has(String(booking.status ?? '').toLowerCase())) continue
        const start = DateTime.fromISO(booking.start_time, { setZone: true }).setZone(STUDIO_TZ)
        const end = DateTime.fromISO(booking.end_time, { setZone: true }).setZone(STUDIO_TZ)
        if (!start.isValid || !end.isValid || end <= start) continue
        let cursor = start
        while (cursor < end) {
          const dayStart = cursor.startOf('day')
          const dayEnd = dayStart.plus({ days: 1 })
          const segmentEnd = end < dayEnd ? end : dayEnd
          const key = toDayKey(dayStart)
          const startMinute = Math.max(0, Math.round(cursor.diff(dayStart, 'minutes').minutes))
          const endMinute = Math.min(24 * 60, Math.round(segmentEnd.diff(dayStart, 'minutes').minutes))
          if (endMinute > startMinute) {
            if (!intervalsByDay[key]) intervalsByDay[key] = []
            intervalsByDay[key].push({ startMinute, endMinute })
          }
          cursor = segmentEnd
        }

        for (const hold of booking.booking_holds ?? []) {
          const holdStart = DateTime.fromISO(hold.hold_start, { setZone: true }).setZone(STUDIO_TZ)
          const holdEnd = DateTime.fromISO(hold.hold_end, { setZone: true }).setZone(STUDIO_TZ)
          if (!holdStart.isValid || !holdEnd.isValid || holdEnd <= holdStart) continue
          let holdCursor = holdStart
          while (holdCursor < holdEnd) {
            const dayStart = holdCursor.startOf('day')
            const dayEnd = dayStart.plus({ days: 1 })
            const segmentEnd = holdEnd < dayEnd ? holdEnd : dayEnd
            const key = toDayKey(dayStart)
            const startMinute = Math.max(0, Math.round(holdCursor.diff(dayStart, 'minutes').minutes))
            const endMinute = Math.min(24 * 60, Math.round(segmentEnd.diff(dayStart, 'minutes').minutes))
            if (endMinute > startMinute) {
              if (!intervalsByDay[key]) intervalsByDay[key] = []
              intervalsByDay[key].push({ startMinute, endMinute })
            }
            holdCursor = segmentEnd
          }
        }
      }

      for (const block of blocksRes.blocks ?? []) {
        if (!block.active) continue
        const start = DateTime.fromISO(block.start_time, { setZone: true }).setZone(STUDIO_TZ)
        const end = DateTime.fromISO(block.end_time, { setZone: true }).setZone(STUDIO_TZ)
        if (!start.isValid || !end.isValid || end <= start) continue
        let cursor = start
        while (cursor < end) {
          const dayStart = cursor.startOf('day')
          const dayEnd = dayStart.plus({ days: 1 })
          const segmentEnd = end < dayEnd ? end : dayEnd
          const key = toDayKey(dayStart)
          const startMinute = Math.max(0, Math.round(cursor.diff(dayStart, 'minutes').minutes))
          const endMinute = Math.min(24 * 60, Math.round(segmentEnd.diff(dayStart, 'minutes').minutes))
          if (endMinute > startMinute) {
            if (!intervalsByDay[key]) intervalsByDay[key] = []
            intervalsByDay[key].push({ startMinute, endMinute })
          }
          cursor = segmentEnd
        }
      }

      const occupiedMinutesByDay: Record<string, number> = {}
      const mergedByDay: Record<string, Array<{ startMinute: number, endMinute: number }>> = {}
      for (const [key, intervals] of Object.entries(intervalsByDay)) {
        const merged = mergeIntervals(intervals)
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

  const selectedDayWindows = computed(() => {
    const key = selectedRescheduleDay.value
    if (!key) return []
    return getOpenWindowsForDay(key)
  })

  const selectedDayFitWindows = computed(() => {
    const duration = Math.max(1, rescheduleDurationMinutes.value || 60)
    return selectedDayWindows.value.filter(window => (window.endMinute - window.startMinute) >= duration)
  })

  function formatMinuteOfDay(minute: number) {
    const clamped = Math.max(0, Math.min(24 * 60, minute))
    const hour = Math.floor(clamped / 60)
    const minutes = clamped % 60
    const dt = DateTime.fromObject({ year: 2000, month: 1, day: 1, hour, minute: minutes })
    return dt.toFormat('h:mm a')
  }

  const selectedDayFitWindowsLabel = computed(() =>
    selectedDayFitWindows.value.slice(0, 4).map(window => `${formatMinuteOfDay(window.startMinute)}–${formatMinuteOfDay(window.endMinute)}`).join(' · ')
  )

  const selectedDayStartOptions = computed(() => {
    const key = selectedRescheduleDay.value
    if (!key) return [] as Array<{ label: string, value: string }>
    const starts = possibleStartMinutesForDay(key)
    return starts
      .map((minute) => {
        const value = toLocalInputForDayMinute(key, minute)
        if (!value) return null
        const labelDate = DateTime.fromFormat(value, "yyyy-LL-dd'T'HH:mm", { zone: STUDIO_TZ })
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
    const key = selectedRescheduleDay.value
    const startMinute = selectedStartMinute.value
    if (!key || startMinute === null) return [] as Array<{ label: string, value: string }>
    const intervals = dayOccupiedIntervals.value[key] ?? []
    const containingWindow = getOpenWindowsForDay(key).find(window => startMinute >= window.startMinute && startMinute < window.endMinute)
    if (!containingWindow) return [] as Array<{ label: string, value: string }>
    const values: number[] = []
    let minute = minuteToAligned30(startMinute + 30)
    while (minute <= containingWindow.endMinute) {
      values.push(minute)
      minute += 30
    }
    if (!values.includes(containingWindow.endMinute)) values.push(containingWindow.endMinute)
    const overlapsOccupied = intervals.some(interval => startMinute >= interval.startMinute && startMinute < interval.endMinute)
    if (overlapsOccupied) return [] as Array<{ label: string, value: string }>

    return Array.from(new Set(values))
      .sort((a, b) => a - b)
      .map((endMinute) => {
        const value = toLocalInputForDayMinute(key, endMinute)
        if (!value) return null
        const labelDate = DateTime.fromFormat(value, "yyyy-LL-dd'T'HH:mm", { zone: STUDIO_TZ })
        return {
          value,
          label: labelDate.isValid ? labelDate.toFormat('EEE, LLL d · h:mm a') : value
        }
      })
      .filter((option): option is { label: string, value: string } => Boolean(option))
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
    const cells: Array<DayCell | null> = []
    const nowLa = DateTime.now().setZone(STUDIO_TZ).startOf('day')
    for (let i = 0; i < leading; i++) cells.push(null)
    let cursor = monthStart
    while (cursor <= monthEnd) {
      const key = toDayKey(cursor)
      const occupied = Number(dayOccupiedMinutes.value[key] ?? 0)
      const status: 'clear' | 'medium' | 'heavy' = occupied === 0 ? 'clear' : occupied >= 10 * 60 ? 'heavy' : 'medium'
      const possibleStarts = possibleStartMinutesForDay(key)
      const disabled = cursor.startOf('day') < nowLa || possibleStarts.length === 0
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

  function onRescheduleStartChange(value: string) {
    rescheduleForm.startTime = value
    const nextStart = localInputToDateTime(value)?.setZone(STUDIO_TZ)
    if (rescheduleAutoSyncEnd.value && nextStart) {
      const alignedEnd = nextStart.plus({ minutes: rescheduleDurationMinutes.value > 0 ? rescheduleDurationMinutes.value : 60 })
      rescheduleForm.endTime = alignedEnd.toFormat("yyyy-LL-dd'T'HH:mm")
    }
    if (nextStart) {
      const monthCursor = nextStart.startOf('month')
      if (!rescheduleMonthCursor.value || !rescheduleMonthCursor.value.hasSame(monthCursor, 'month')) {
        rescheduleMonthCursor.value = monthCursor
      }
    }
    void loadRescheduleMonthHints(value)
  }

  function onRescheduleEndChange(value: string) {
    rescheduleForm.endTime = value
    const start = localInputToDateTime(rescheduleForm.startTime)
    const end = localInputToDateTime(value)
    if (start && end && end > start) {
      rescheduleDurationMinutes.value = Math.max(1, Math.round(end.diff(start, 'minutes').minutes))
      rescheduleAutoSyncEnd.value = false
    }
  }

  function applyRescheduleDay(key: string) {
    const possibleStarts = possibleStartMinutesForDay(key)
    if (!possibleStarts.length) return
    const current = localInputToDateTime(rescheduleForm.startTime)?.setZone(STUDIO_TZ)
      ?? DateTime.now().setZone(STUDIO_TZ).set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
    const [year, month, day] = key.split('-').map(Number)
    const dayBase = DateTime.fromObject({ year, month, day }, { zone: STUDIO_TZ })
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
    onRescheduleStartChange(next.toFormat("yyyy-LL-dd'T'HH:mm"))
  }

  const rescheduleSummaryLabel = computed(() => {
    const minutes = Math.max(1, Math.round(rescheduleDurationMinutes.value || 60))
    const hours = Math.round((minutes / 60) * 100) / 100
    const hoursLabel = Number.isInteger(hours) ? `${hours.toFixed(0)}hr` : `${hours}hr`
    const holdLabel = rescheduleForm.hadHold && rescheduleForm.keepHold ? ' + hold' : ''
    return `${hoursLabel} booking${holdLabel}`
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
    const maxMonth = DateTime.now().setZone(STUDIO_TZ).plus({ months: 12 }).startOf('month')
    return cursor < maxMonth
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

  const holdEligibility = computed(() => {
    if (!rescheduleForm.hadHold || !rescheduleForm.keepHold) return { ok: true, reasons: [] as string[] }
    const start = localInputToDateTime(rescheduleForm.startTime)?.setZone(STUDIO_TZ)
    const end = localInputToDateTime(rescheduleForm.endTime)?.setZone(STUDIO_TZ)
    if (!start || !end || !start.isValid || !end.isValid || end <= start) {
      return { ok: false, reasons: ['Select a valid start and end time to keep hold.'] }
    }
    const reasons: string[] = []
    const durationHours = end.diff(start, 'hours').hours
    if (durationHours < minHoldBookingHours.value) reasons.push(`Booking must be at least ${minHoldBookingHours.value} hours.`)
    const requiredEnd = end.startOf('day').set({ hour: holdMinEndHour.value, minute: 0, second: 0, millisecond: 0 })
    if (end < requiredEnd) reasons.push(`Booking must end at or after ${holdMinEndLabel.value}.`)
    return { ok: reasons.length === 0, reasons }
  })

  watch(() => rescheduleForm.keepHold, () => {
    void loadRescheduleMonthHints(rescheduleForm.startTime)
  })

  async function saveReschedule() {
    if (!rescheduleForm.bookingId) return
    reschedulingId.value = rescheduleForm.bookingId
    try {
      const start = fromLocalInputValue(rescheduleForm.startTime)
      const end = fromLocalInputValue(rescheduleForm.endTime)
      if (!start || !end) throw new Error('Start and end time are required')
      if (new Date(start).getTime() < Date.now()) throw new Error('Cannot reschedule into the past')
      if (!holdEligibility.value.ok) throw new Error(holdEligibility.value.reasons[0] ?? 'Hold requirements are not met')
      await $fetch('/api/admin/bookings/reschedule', {
        method: 'POST',
        body: {
          bookingId: rescheduleForm.bookingId,
          startTime: start,
          endTime: end,
          keepHold: rescheduleForm.hadHold ? rescheduleForm.keepHold : false,
          notes: rescheduleForm.notes || null
        }
      })
      toast.add({ title: 'Booking rescheduled' })
      await options.onSaved()
      rescheduleOpen.value = false
      rescheduleForm.bookingId = ''
      rescheduleForm.startTime = ''
      rescheduleForm.endTime = ''
      rescheduleForm.notes = ''
      rescheduleForm.hadHold = false
      rescheduleForm.keepHold = false
      rescheduleDurationMinutes.value = 0
      rescheduleAutoSyncEnd.value = true
      rescheduleHintsLoading.value = false
      rescheduleHintsError.value = null
      rescheduleHintMonth.value = ''
      rescheduleMonthCursor.value = null
      rescheduleDayCycleIndex.value = {}
      reschedulePreferredStartMinute.value = null
      dayOccupiedMinutes.value = {}
      dayOccupiedIntervals.value = {}
    } catch (error: unknown) {
      toast.add({
        title: 'Could not reschedule booking',
        description: readErrorMessage(error),
        color: 'error'
      })
    } finally {
      reschedulingId.value = null
    }
  }

  return {
    reschedulingId,
    rescheduleOpen,
    rescheduleForm,
    rescheduleSummaryLabel,
    rescheduleHintsLoading,
    rescheduleHintsError,
    rescheduleMonthCells,
    rescheduleMonthLabel,
    selectedDayStartOptions,
    selectedDayEndOptions,
    selectedDayFitWindows,
    selectedDayFitWindowsLabel,
    rescheduleDurationMinutes,
    holdEligibility,
    holdMinEndLabel,
    holdEndLabel,
    canGoToPrevMonth,
    canGoToNextMonth,
    openReschedule,
    closeReschedule,
    onRescheduleStartChange,
    onRescheduleEndChange,
    applyRescheduleDay,
    goToPrevRescheduleMonth,
    goToNextRescheduleMonth,
    saveReschedule
  }
}
