<script setup lang="ts">
import FullCalendar from '@fullcalendar/vue3'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'

type CalendarEvent = { id: string; start: string; end: string; display?: string; title?: string }

const props = defineProps<{
  endpoint: string // '/api/calendar/public' or '/api/calendar/member'
}>()

const emit = defineEmits<{
  (e: 'select', payload: { start: Date; end: Date }): void
}>()

const loading = ref(false)
const events = ref<CalendarEvent[]>([])

async function loadEvents(rangeStart?: Date, rangeEnd?: Date) {
  loading.value = true
  try {
    const q: any = {}
    if (rangeStart) q.from = rangeStart.toISOString()
    if (rangeEnd) q.to = rangeEnd.toISOString()

    const res = await $fetch<{ events: CalendarEvent[] }>(props.endpoint, { query: q })
    events.value = res.events ?? []
  } finally {
    loading.value = false
  }
}

const calendarOptions = computed(() => ({
  plugins: [timeGridPlugin, interactionPlugin],
  initialView: 'timeGridWeek',
  selectable: true,
  selectMirror: true,
  nowIndicator: true,
  allDaySlot: false,
  height: 'auto',
  slotMinTime: '07:00:00',
  slotMaxTime: '22:00:00',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'timeGridWeek,timeGridDay'
  },
  events: events.value,
  select: (info: any) => emit('select', { start: info.start, end: info.end }),
  datesSet: (info: any) => {
    // Called when the visible range changes
    loadEvents(info.start, info.end)
  }
}))

onMounted(() => loadEvents())
</script>

<template>
  <div class="space-y-2">
    <div v-if="loading" class="text-sm text-gray-500">Loading availability…</div>
    <FullCalendar :options="calendarOptions" />
  </div>
</template>
