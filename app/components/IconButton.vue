<script setup lang="ts">
defineOptions({ inheritAttrs: false })

type ButtonColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
type ButtonVariant = 'solid' | 'outline' | 'soft' | 'subtle' | 'ghost' | 'link'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

withDefaults(defineProps<{
  label: string
  icon: string
  color?: ButtonColor
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  tooltip?: boolean
}>(), {
  color: 'neutral',
  variant: 'ghost',
  size: 'md',
  disabled: false,
  loading: false,
  tooltip: true
})
</script>

<template>
  <UButton
    v-bind="$attrs"
    class="app-icon-button"
    square
    :icon="icon"
    :color="color"
    :variant="variant"
    :size="size"
    :disabled="disabled"
    :loading="loading"
    :aria-label="label"
    :title="tooltip ? label : undefined"
  />
</template>
