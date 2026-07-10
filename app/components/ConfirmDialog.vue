<script setup lang="ts">
type ConfirmColor = 'primary' | 'error' | 'warning'

const props = withDefaults(defineProps<{
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  busyLabel?: string
  color?: ConfirmColor
  busy?: boolean
  disabled?: boolean
}>(), {
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  busyLabel: 'Confirming',
  color: 'primary',
  busy: false,
  disabled: false
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const open = defineModel<boolean>('open', { required: true })

function cancel() {
  if (props.busy) return
  open.value = false
  emit('cancel')
}

function confirm() {
  if (props.busy || props.disabled) return
  emit('confirm')
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="!busy"
    :close="!busy"
    :busy="busy"
    size="sm"
  >
    <template
      v-if="$slots.default"
      #default
    >
      <slot />
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          color="neutral"
          variant="soft"
          :disabled="busy"
          @click="cancel"
        >
          {{ cancelLabel }}
        </UButton>
        <UButton
          :color="color"
          :loading="busy"
          :disabled="disabled || busy"
          @click="confirm"
        >
          {{ confirmLabel }}
        </UButton>
      </div>
      <span
        class="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ busy ? busyLabel : '' }}
      </span>
    </template>
  </AppDialog>
</template>
