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
const actionCount = computed(() => Number(props.showLinkAction) + Number(showNotificationAction.value))
const hasActions = computed(() => actionCount.value > 0)
const hasLinkNavigation = computed(() => Boolean(props.linkTo) && !props.linkDisabled)

const cutoutStyle = computed(() => {
  if (!hasActions.value) return undefined
  const count = actionCount.value
  const pad = 0.35
  const btnSize = 2.28
  const btnGap = 0.36
  const w = pad + count * btnSize + (count - 1) * btnGap + pad
  const h = pad + btnSize + pad
  return {
    '--cutout-w': `${w}rem`,
    '--cutout-h': `${h}rem`,
    '--cutout-r': '0.92rem'
  } as Record<string, string>
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
    <div
      v-if="hasActions"
      class="ops-kpi-cutout"
      :style="cutoutStyle"
      aria-hidden="true"
    />

    <UCard
      :class="[
        'ops-kpi-card border-0',
        { 'ops-kpi-card--with-actions': hasActions },
        cardClass
      ]"
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
  overflow: visible;
  --admin-kpi-surface: color-mix(in srgb, var(--ui-bg-elevated) 72%, transparent 28%);
  --ops-kpi-shell-bg: var(--admin-ops-shell-bg, transparent);
}

.ops-kpi-card {
  height: 100%;
  border-radius: inherit;
  overflow: hidden;
}

.ops-kpi-cutout {
  position: absolute;
  top: 0;
  right: 0;
  width: var(--cutout-w, 0);
  height: var(--cutout-h, 0);
  z-index: 2;
  border-bottom-left-radius: var(--cutout-r, 0.92rem);
  background: var(--ops-kpi-shell-bg, transparent);
  pointer-events: none;
}

.ops-kpi-actions {
  position: absolute;
  top: 0.14rem;
  right: 0.14rem;
  z-index: 4;
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
