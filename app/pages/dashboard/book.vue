<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'membership-required'] })

const toast = useToast()

// Modal state
const open = ref(false)
const confirming = ref(false)

// Selected time slot
const selected = ref<{ start: Date; end: Date } | null>(null)

// Form fields inside the modal
const form = reactive({
  notes: '',
  request_hold: false
})

// Credit preview — fetched when a time slot is selected
const preview = ref<{
  creditsNeeded: number
  peakMultiplier: number
  durationHours: number
  tierName: string | null
  breakdown: { isPeakWindow: boolean }
} | null>(null)
const previewLoading = ref(false)
const previewError = ref<string | null>(null)

// Bump this key to force calendar to remount + reload events after a booking
const calendarKey = ref(0)

async function fetchPreview(start: Date, end: Date) {
  previewLoading.value = true
  previewError.value = null
  preview.value = null
  try {
    const res = await $fetch('/api/bookings/preview', {
      query: {
        start: start.toISOString(),
        end: end.toISOString(),
        mode: 'member'
      }
    }) as any
    preview.value = res
  } catch (e: any) {
    previewError.value = e?.data?.statusMessage ?? e?.message ?? 'Could not calculate cost'
  } finally {
    previewLoading.value = false
  }
}

function onSelect(payload: { start: Date; end: Date }) {
  selected.value = payload
  form.notes = ''
  form.request_hold = false
  preview.value = null
  previewError.value = null
  open.value = true
  fetchPreview(payload.start, payload.end)
}

function closeModal() {
  if (confirming.value) return
  open.value = false
  preview.value = null
  previewError.value = null
}

async function confirmBooking() {
  if (!selected.value) return
  confirming.value = true
  try {
    const res = await $fetch('/api/bookings/create', {
      method: 'POST',
      body: {
        start_time: selected.value.start.toISOString(),
        end_time: selected.value.end.toISOString(),
        notes: form.notes || null,
        request_hold: form.request_hold
      }
    }) as any

    toast.add({
      title: 'Studio booked!',
      description: `${res.burned} credits used. New balance: ${res.newBalance} credits.`,
      color: 'success'
    })
    closeModal()
    calendarKey.value++ // refresh calendar events
  } catch (e: any) {
    const msg = e?.data?.statusMessage ?? e?.message ?? 'Booking failed'
    toast.add({ title: 'Could not book', description: msg, color: 'error' })
  } finally {
    confirming.value = false
  }
}

function formatDateTime(d: Date) {
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
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
</script>

<template>
  <UDashboardPanel id="book">
    <template #header>
      <UDashboardNavbar title="Book Studio" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-lucide-list-checks"
            to="/dashboard/bookings"
          >
            My bookings
          </UButton>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <p class="text-sm text-dimmed">
            Click and drag on the calendar to select a time slot. Your tier's booking window and peak-hour credit rates apply.
          </p>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="p-4">
        <AvailabilityCalendar
          :key="calendarKey"
          endpoint="/api/calendar/member"
          @select="onSelect"
        />
      </div>
    </template>
  </UDashboardPanel>

  <!-- Booking confirmation modal -->
  <UModal v-model:open="open" :dismissible="!confirming">
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-base">Confirm booking</h3>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="confirming"
              @click="closeModal"
            />
          </div>
        </template>

        <div class="space-y-4">
          <!-- Time summary -->
          <div v-if="selected" class="rounded-lg bg-elevated p-3 space-y-1.5 text-sm">
            <div class="flex justify-between">
              <span class="text-dimmed">Start</span>
              <span class="font-medium">{{ formatDateTime(selected.start) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-dimmed">End</span>
              <span class="font-medium">{{ formatDateTime(selected.end) }}</span>
            </div>
          </div>

          <!-- Credit cost preview -->
          <div class="rounded-lg border border-default p-3 space-y-2">
            <div class="text-sm font-medium">Credit cost</div>

            <div v-if="previewLoading" class="flex items-center gap-2 text-sm text-dimmed">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
              Calculating…
            </div>

            <div v-else-if="previewError" class="text-sm text-red-500 dark:text-red-400">
              {{ previewError }}
            </div>

            <div v-else-if="preview" class="space-y-1 text-sm">
              <div class="flex justify-between items-center">
                <span class="text-dimmed">Duration</span>
                <span>{{ formatDuration(preview.durationHours) }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-dimmed">Rate</span>
                <UBadge
                  :color="preview.breakdown.isPeakWindow ? 'warning' : 'success'"
                  variant="soft"
                  size="sm"
                >
                  {{ preview.breakdown.isPeakWindow ? `Peak (${formatPeakCredits(preview.peakMultiplier)} credits/hr)` : 'Off-peak (1 credit/hr)' }}
                </UBadge>
              </div>
              <div class="flex justify-between items-center border-t border-default pt-2 mt-1">
                <span class="font-medium">Total</span>
                <span class="text-lg font-semibold">{{ preview.creditsNeeded }} credits</span>
              </div>
              <div v-if="preview.tierName" class="text-xs text-dimmed">
                Calculated for your {{ preview.tierName }} membership
              </div>
            </div>
          </div>

          <!-- Notes -->
          <UFormField label="Notes" hint="Optional">
            <UTextarea
              v-model="form.notes"
              placeholder="Setup requirements, shoot type, etc."
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <!-- Overnight hold -->
          <UCheckbox
            v-model="form.request_hold"
            label="Request overnight equipment hold"
            description="Extends your reservation until 10am the next day so you can leave equipment set up overnight."
          />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              :disabled="confirming"
              @click="closeModal"
            >
              Cancel
            </UButton>
            <UButton
              :loading="confirming"
              :disabled="previewLoading || !!previewError || !preview"
              @click="confirmBooking"
            >
              Book {{ preview ? `· ${preview.creditsNeeded} cr` : '' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
