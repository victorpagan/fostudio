<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const slots = useSlots()

const tone = computed(() => typeof attrs.color === 'string' ? attrs.color : 'neutral')
const resolvedRole = computed(() => {
  if (attrs.role === 'alert' || attrs.role === 'status') return attrs.role
  return tone.value === 'error' ? 'alert' : 'status'
})
const liveMode = computed(() => resolvedRole.value === 'alert' ? 'assertive' : 'polite')
</script>

<template>
  <UAlert
    v-bind="$attrs"
    class="app-status"
    :role="resolvedRole"
    :aria-live="liveMode"
    aria-atomic="true"
    :data-status-tone="tone"
  >
    <template
      v-for="(_, slotName) in slots"
      #[slotName]="slotProps"
    >
      <slot
        :name="slotName"
        v-bind="slotProps"
      />
    </template>
  </UAlert>
</template>
