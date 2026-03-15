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

export function useAdminBookingReschedule(options: UseAdminBookingRescheduleOptions) {
  const toast = useToast()
  const reschedulingId = ref<string | null>(null)
  const rescheduleOpen = ref(false)

  const rescheduleForm = reactive({
    bookingId: '' as string,
    startTime: '',
    endTime: '',
    notes: '' as string,
    hadHold: false,
    keepHold: false
  })

  function toLocalInputValue(value: string | null | undefined) {
    if (!value) return ''
    const parsedIso = DateTime.fromISO(value, { setZone: true })
    if (parsedIso.isValid) return parsedIso.setZone('America/Los_Angeles').toFormat("yyyy-LL-dd'T'HH:mm")
    const parsedSql = DateTime.fromSQL(value, { zone: 'utc' })
    if (parsedSql.isValid) return parsedSql.setZone('America/Los_Angeles').toFormat("yyyy-LL-dd'T'HH:mm")
    return ''
  }

  function fromLocalInputValue(value: string) {
    if (!value.trim()) return null
    const dt = DateTime.fromFormat(value, "yyyy-LL-dd'T'HH:mm", { zone: 'America/Los_Angeles' })
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
  }

  async function saveReschedule() {
    if (!rescheduleForm.bookingId) return
    reschedulingId.value = rescheduleForm.bookingId
    try {
      const start = fromLocalInputValue(rescheduleForm.startTime)
      const end = fromLocalInputValue(rescheduleForm.endTime)
      if (!start || !end) throw new Error('Start and end time are required')
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
      closeReschedule()
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
    openReschedule,
    closeReschedule,
    saveReschedule
  }
}
