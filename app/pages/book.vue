<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'membership-required'] })

const toast = useToast()
const open = ref(false)
const loading = ref(false)

const selected = ref<{ start: Date; end: Date } | null>(null)

const form = reactive({
  notes: '',
  request_hold: false
})

function onSelect(payload: { start: Date; end: Date }) {
  selected.value = payload
  open.value = true
}

async function confirmBooking() {
  if (!selected.value) return
  loading.value = true
  try {
    const res = await $fetch('/api/bookings/create', {
      method: 'POST',
      body: {
        start_time: selected.value.start.toISOString(),
        end_time: selected.value.end.toISOString(),
        notes: form.notes || null,
        request_hold: form.request_hold
      }
    })

    toast.add({
      title: 'Booked!',
      description: `Used ${res.burned} credits. New balance: ${res.newBalance}.`
    })
    open.value = false
    form.notes = ''
    form.request_hold = false
  } catch (e: any) {
    toast.add({
      title: 'Could not book',
      description: e?.statusMessage ?? e?.message ?? 'Error',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UContainer class="py-10">
    <div class="max-w-4xl">
      <h1 class="text-3xl font-semibold tracking-tight">Book Studio</h1>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Select an available time on the calendar to book instantly.
      </p>

      <UCard class="mt-6">
        <!-- Member endpoint can later enforce booking_window_days;
             for v1 you can keep public endpoint if you want -->
        <AvailabilityCalendar endpoint="/api/calendar/member" @select="onSelect" />
      </UCard>
    </div>

    <UModal v-model="open">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="font-semibold">Confirm booking</div>
            <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="open = false" />
          </div>
        </template>

        <div v-if="selected" class="space-y-3">
          <div class="text-sm text-gray-600 dark:text-gray-300">
            <div><span class="font-medium">Start:</span> {{ selected.start.toLocaleString() }}</div>
            <div><span class="font-medium">End:</span> {{ selected.end.toLocaleString() }}</div>
          </div>

          <UTextarea v-model="form.notes" placeholder="Notes (optional)" />
          <UCheckbox v-model="form.request_hold" label="Request overnight equipment hold (end → 10am next day)" />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="soft" @click="open = false">Cancel</UButton>
            <UButton :loading="loading" @click="confirmBooking">Confirm</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </UContainer>
</template>
