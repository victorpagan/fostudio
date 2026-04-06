<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(defineProps<{
  cardClass?: string
  showLinkAction?: boolean
  showNotificationAction?: boolean
  notificationDisabled?: boolean
  linkDisabled?: boolean
  linkTo?: RouteLocationRaw | null
  linkAriaLabel?: string
  notificationAriaLabel?: string
}>(), {
  cardClass: '',
  showLinkAction: false,
  showNotificationAction: false,
  notificationDisabled: true,
  linkDisabled: false,
  linkTo: null,
  linkAriaLabel: 'Open details',
  notificationAriaLabel: 'Notifications'
})

const emit = defineEmits<{
  (event: 'link' | 'notification'): void
}>()

const showNotificationAction = computed(() => props.showNotificationAction && !props.notificationDisabled)
const visibleActionCount = computed(() => Number(props.showLinkAction) + Number(showNotificationAction.value))
const hasActions = computed(() => visibleActionCount.value > 0)
const hasLinkNavigation = computed(() => Boolean(props.linkTo) && !props.linkDisabled)

const cutoutStyle = computed(() => {
  if (!hasActions.value) return undefined
  const count = visibleActionCount.value
  const pad = 0.35
  const btnSize = 2.28
  const btnGap = 0.36
  const w = pad + count * btnSize + (count - 1) * btnGap + pad
  const h = pad + btnSize + pad
  return {
    '--cutout-w': `${w}rem`,
    '--cutout-h': `${h}rem`
  } as Record<string, string>
})

const cutoutPathD = computed(() => {
  // SVG path for rounded rectangular cutout
  // Using fill-rule: evenodd to cut out the inner rect
  const r = 0.65 // corner radius
  const mainR = 1 // card radius

  // Dimensions in units where width=1, height=1
  // This will be scaled by viewBox in SVG

  // Count and dimensions
  const count = visibleActionCount.value
  const pad = 0.35 / 16 // convert rem to proportion
  const btnSize = 2.28 / 16
  const btnGap = 0.36 / 16
  const cutw = pad + count * btnSize + (count - 1) * btnGap + pad
  const cuth = pad + btnSize + pad

  const cutx = 1 - cutw
  const cuty = 0
  const r_prop = r / 16

  // Outer boundary (clockwise from top-left)
  let path = `M ${mainR} 0 L ${1 - mainR} 0 Q 1 0 1 ${mainR} L 1 ${1 - mainR} Q 1 1 ${1 - mainR} 1 L ${mainR} 1 Q 0 1 0 ${1 - mainR} L 0 ${mainR} Q 0 0 ${mainR} 0`

  // Cutout hole (clockwise from top-right corner)
  path += ` M ${cutx + r_prop} ${cuty} L ${1 - r_prop} ${cuty} Q 1 ${cuty} 1 ${cuty + r_prop} L 1 ${cuth - r_prop} Q 1 ${cuth} ${1 - r_prop} ${cuth} L ${cutx + r_prop} ${cuth} Q ${cutx} ${cuth} ${cutx} ${cuth - r_prop} L ${cutx} ${cuty + r_prop} Q ${cutx} ${cuty} ${cutx + r_prop} ${cuty}`

  return path
})

function onLinkAction() {
  if (props.linkDisabled) return
  emit('link')
}

function onNotificationAction() {
  if (props.notificationDisabled) return
  emit('notification')
}
</script>

<template>
  <div
    class="ops-kpi-shell"
    :class="{ 'ops-kpi-shell--with-actions': hasActions }"
  >
    <UCard
      :class="[
        'ops-kpi-card border-0',
        cardClass
      ]"
      :style="cutoutStyle"
    >
      <slot />
    </UCard>

    <div
      v-if="hasActions"
      class="ops-kpi-actions"
    >
      <button
        v-if="showNotificationAction"
        type="button"
        class="ops-kpi-action-btn ops-kpi-action-btn--notification"
        :aria-label="notificationAriaLabel"
        @click="onNotificationAction"
      >
        <UIcon
          name="i-lucide-bell"
          class="size-4"
        />
      </button>

      <NuxtLink
        v-if="showLinkAction && hasLinkNavigation"
        :to="linkTo as RouteLocationRaw"
        class="ops-kpi-action-btn ops-kpi-action-btn--link"
        :aria-label="linkAriaLabel"
      >
        <UIcon
          name="i-lucide-arrow-up-right"
          class="size-4"
        />
      </NuxtLink>

      <button
        v-if="showLinkAction && !hasLinkNavigation"
        type="button"
        class="ops-kpi-action-btn ops-kpi-action-btn--link"
        :aria-label="linkAriaLabel"
        :disabled="linkDisabled"
        @click="onLinkAction"
      >
        <UIcon
          name="i-lucide-arrow-up-right"
          class="size-4"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ops-kpi-shell {
  position: relative;
  height: 100%;
  border-radius: 1rem;
  overflow: hidden;
  --admin-kpi-surface: color-mix(in srgb, var(--ui-bg-elevated) 72%, transparent 28%);
}

.ops-kpi-card {
  height: 100%;
  border-radius: inherit;
  overflow: hidden;
}


.ops-kpi-actions {
  position: absolute;
  top: 0.14rem;
  right: 0.14rem;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
  padding: 0.21rem;
  background: transparent;
}

.ops-kpi-action-btn {
  width: 2.28rem;
  height: 2.28rem;
  border-radius: 0.65rem 0.65rem 0 0;
  border: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ops-kpi-action-btn:disabled {
  cursor: not-allowed;
}

.ops-kpi-action-btn--notification {
  color: #f5f7fa;
  background: #1b1f27;
}

.dark .ops-kpi-action-btn--notification {
  color: #f1f1f1;
  background: #191919;
}

.ops-kpi-action-btn--notification:disabled {
  opacity: 0.78;
}

.ops-kpi-action-btn--link {
  color: color-mix(in srgb, var(--ui-text-highlighted) 92%, transparent 8%);
  background: var(--admin-kpi-surface, color-mix(in srgb, var(--ui-bg-elevated) 72%, transparent 28%));
}

.ops-kpi-action-btn--link:disabled {
  opacity: 0.6;
}
</style>
