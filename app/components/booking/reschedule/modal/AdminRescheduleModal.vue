<script setup lang="ts">
type AdminRescheduleForm = {
  bookingId: string
  startTime: string
  endTime: string
  notes: string
  hadHold: boolean
  keepHold: boolean
}

type DayCell = {
  key: string
  day: number
  status: 'clear' | 'medium' | 'heavy'
  selected: boolean
  disabled: boolean
}

type OptionItem = {
  label: string
  value: string
}

type DayWindow = {
  startMinute: number
  endMinute: number
}

const props = defineProps<{
  loading: boolean
  form: AdminRescheduleForm
  summaryLabel: string
  monthLabel: string
  hintsLoading: boolean
  hintsError: string | null
  monthCells: Array<DayCell | null>
  startOptions: OptionItem[]
  endOptions: OptionItem[]
  fitWindows: DayWindow[]
  fitWindowsLabel: string
  durationMinutes: number
  holdEligibility: { ok: boolean, reasons: string[] }
  holdMinEndLabel: string
  holdEndLabel: string
  canGoPrevMonth: boolean
  canGoNextMonth: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  close: []
  save: []
  applyDay: [key: string]
  startChange: [value: string]
  endChange: [value: string]
  prevMonth: []
  nextMonth: []
}>()

function handleClose() {
  emit('close')
  open.value = false
}

function handleStartSelectChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  emit('startChange', String(target?.value ?? ''))
}

function handleEndSelectChange(event: Event) {
  const target = event.target as HTMLSelectElement | null
  emit('endChange', String(target?.value ?? ''))
}
</script>

<template>
  <UModal
    v-model:open="open"
    :dismissible="!props.loading"
    @update:open="(value) => { if (!value) emit('close') }"
  >
    <template #content>
      <UCard v-if="props.form.bookingId">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="font-medium">
                Adjust booking time
              </div>
              <div class="text-sm text-dimmed">
                Rescheduling does not auto-recalculate burned credits. Use member credit adjustments when needed.
              </div>
            </div>
            <UButton
              color="neutral"
              variant="soft"
              :disabled="props.loading"
              @click="handleClose"
            >
              Close
            </UButton>
          </div>
        </template>

        <div class="grid gap-3 md:grid-cols-3">
          <UFormField label="Start">
            <select
              class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
              :value="props.form.startTime"
              @change="handleStartSelectChange"
            >
              <option
                v-if="!props.startOptions.length"
                disabled
                value=""
              >
                No available start times for selected day
              </option>
              <option
                v-for="option in props.startOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </UFormField>
          <UFormField label="End">
            <select
              class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
              :value="props.form.endTime"
              @change="handleEndSelectChange"
            >
              <option
                v-if="!props.endOptions.length"
                disabled
                value=""
              >
                No available end times for selected start
              </option>
              <option
                v-for="option in props.endOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </UFormField>
          <UFormField label="Notes">
            <UInput v-model="props.form.notes" placeholder="Optional update notes" />
          </UFormField>
        </div>

        <div class="mt-3 text-sm text-dimmed">
          {{ props.summaryLabel }}
        </div>

        <div class="mt-3 rounded-lg border border-default p-3 space-y-3">
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
                :disabled="!props.canGoPrevMonth"
                @click="emit('prevMonth')"
              />
              <span class="min-w-28 text-center text-xs font-medium">
                {{ props.monthLabel }}
              </span>
              <UButton
                icon="i-lucide-chevron-right"
                color="neutral"
                variant="soft"
                size="xs"
                :disabled="!props.canGoNextMonth"
                @click="emit('nextMonth')"
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
            v-if="props.hintsLoading"
            class="text-xs text-dimmed"
          >
            Refreshing day load hints…
          </p>
          <p
            v-if="props.hintsError"
            class="text-xs text-red-500 dark:text-red-400"
          >
            {{ props.hintsError }}
          </p>
          <div class="relative">
            <div
              class="grid grid-cols-7 gap-1.5 transition-opacity"
              :class="props.hintsLoading ? 'opacity-70' : 'opacity-100'"
            >
              <button
                v-for="(cell, idx) in props.monthCells"
                :key="cell?.key ?? `blank-${idx}`"
                type="button"
                class="relative h-9 rounded-md border text-xs"
                :class="cell
                  ? (cell.selected
                    ? (cell.disabled ? 'border-black bg-black text-white/50' : 'border-primary bg-primary/10')
                    : (cell.disabled ? 'border-black bg-black text-white/40' : 'border-default hover:bg-elevated'))
                  : 'border-transparent opacity-0 pointer-events-none'"
                :disabled="!cell || cell.disabled"
                @click="cell && emit('applyDay', cell.key)"
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
          </div>

          <div class="space-y-1">
            <p class="text-xs font-medium">
              Open windows for selected day
            </p>
            <p
              v-if="!props.fitWindows.length"
              class="text-xs text-dimmed"
            >
              No windows can fit {{ Math.max(1, Math.round(props.durationMinutes || 60)) }} minutes.
            </p>
            <p
              v-else
              class="text-xs text-dimmed"
            >
              {{ props.fitWindowsLabel }}
            </p>
          </div>
        </div>

        <UAlert
          v-if="props.form.hadHold"
          class="mt-3"
          color="warning"
          variant="soft"
          icon="i-lucide-package"
          :description="props.form.keepHold ? 'This booking has a hold. Reschedule will try to keep and satisfy it by default.' : 'Hold will be removed on save, and any hold credits/tokens used for this booking will be refunded.'"
        />
        <UCheckbox
          v-if="props.form.hadHold"
          v-model="props.form.keepHold"
          class="mt-3"
          label="Keep overnight hold after reschedule"
        />
        <UAlert
          v-if="props.form.hadHold && props.form.keepHold && !props.holdEligibility.ok"
          class="mt-2"
          color="warning"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="props.holdEligibility.reasons.join(' ')"
        />
        <p
          v-if="props.form.hadHold && props.form.keepHold"
          class="mt-2 text-xs text-dimmed"
        >
          Holds require a minimum booking length and end time of {{ props.holdMinEndLabel }} or later. Holds run until {{ props.holdEndLabel }} next day.
        </p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              :disabled="props.loading"
              @click="handleClose"
            >
              Cancel
            </UButton>
            <UButton
              :loading="props.loading"
              @click="emit('save')"
            >
              Save new time
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
