<script setup lang="ts">
type SwitchColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
type SwitchSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(defineProps<{
  id?: string
  label: string
  description?: string
  name?: string
  color?: SwitchColor
  size?: SwitchSize
  disabled?: boolean
  loading?: boolean
  required?: boolean
}>(), {
  id: undefined,
  description: undefined,
  name: undefined,
  color: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  required: false
})

const model = defineModel<boolean>({ required: true })
const generatedId = useId()
const controlId = computed(() => props.id || `switch-${generatedId}`)
const labelId = computed(() => `${controlId.value}-label`)
const descriptionId = computed(() => `${controlId.value}-description`)
</script>

<template>
  <div
    class="app-switch-row"
    :class="{ 'app-switch-row--disabled': disabled || loading }"
  >
    <div class="min-w-0 flex-1">
      <label
        :id="labelId"
        :for="controlId"
        class="app-switch-row__label"
      >
        <slot name="label">
          {{ label }}
        </slot>
        <span
          v-if="required"
          aria-hidden="true"
          class="text-error"
        >*</span>
      </label>
      <p
        v-if="description || $slots.description"
        :id="descriptionId"
        class="app-switch-row__description"
      >
        <slot name="description">
          {{ description }}
        </slot>
      </p>
    </div>

    <USwitch
      :id="controlId"
      v-model="model"
      :name="name"
      :color="color"
      :size="size"
      :disabled="disabled"
      :loading="loading"
      :required="required"
      :aria-labelledby="labelId"
      :aria-describedby="description || $slots.description ? descriptionId : undefined"
    />
  </div>
</template>
