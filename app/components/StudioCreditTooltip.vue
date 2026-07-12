<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'

const props = withDefaults(defineProps<{
  label?: string
  description?: string
}>(), {
  label: 'credits',
  description: '1 credit covers 1 off-peak studio hour. Peak hours use more credits per hour based on your membership or non-member rate.'
})

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const pinned = ref(false)
const tooltipId = `studio-credit-tooltip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

function show() {
  open.value = true
}

function hide() {
  if (!pinned.value) open.value = false
}

function toggle() {
  pinned.value = !pinned.value
  open.value = pinned.value
}

function close() {
  pinned.value = false
  open.value = false
  const activeElement = document.activeElement
  if (activeElement instanceof HTMLElement && root.value?.contains(activeElement)) {
    activeElement.blur()
  }
}

function handleFocusOut() {
  requestAnimationFrame(() => {
    if (!root.value?.contains(document.activeElement)) hide()
  })
}

function handleOutsidePointer(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && root.value?.contains(target)) return
  close()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointer)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointer)
})
</script>

<template>
  <span
    ref="root"
    class="landing-credit-help"
    :class="{ 'is-open': open }"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="handleFocusOut"
    @keydown.esc.stop="close"
  >
    <button
      type="button"
      class="landing-credit-term"
      aria-label="What is a studio credit?"
      aria-haspopup="true"
      :aria-expanded="open"
      :aria-describedby="open ? tooltipId : undefined"
      @click.stop="toggle"
    >
      {{ props.label }}
    </button>
    <span
      :id="tooltipId"
      role="tooltip"
      class="landing-credit-tooltip"
      :aria-hidden="!open"
    >
      {{ props.description }}
    </span>
  </span>
</template>
