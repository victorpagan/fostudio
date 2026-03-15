<script setup lang="ts">
type AdminRescheduleForm = {
  bookingId: string
  startTime: string
  endTime: string
  notes: string
  hadHold: boolean
  keepHold: boolean
}

const props = defineProps<{
  loading: boolean
  form: AdminRescheduleForm
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  close: []
  save: []
}>()

function handleClose() {
  emit('close')
  open.value = false
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
            <UInput
              v-model="props.form.startTime"
              type="datetime-local"
            />
          </UFormField>
          <UFormField label="End">
            <UInput
              v-model="props.form.endTime"
              type="datetime-local"
            />
          </UFormField>
          <UFormField label="Notes">
            <UInput v-model="props.form.notes" placeholder="Optional update notes" />
          </UFormField>
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
