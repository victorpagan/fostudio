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
        cardClass,
        { 'ops-kpi-card--with-actions': hasActions }
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

.ops-kpi-card--with-actions {
  --cutout-r: 0.9rem;
  --cutout-sr: 0.45rem;

  /*
   * Mask uses subtract compositing to punch a rounded-corner hole
   * from the card. 5 layers, bottom-up:
   *   L5: BR corner anti-fill
   *   L4: TL corner anti-fill
   *   L3: BL corner anti-fill (main inverted radius)
   *   L2: cutout rectangle      ── subtract (anti-fills) → rounded cutout
   *   L1: full card base        ── subtract (rounded cutout) → final shape
   */
  -webkit-mask-image:
    linear-gradient(black, black),
    linear-gradient(black, black),
    radial-gradient(circle at 100% 0%, transparent calc(var(--cutout-r) - 0.5px), black calc(var(--cutout-r) + 0.5px)),
    radial-gradient(circle at 100% 100%, transparent calc(var(--cutout-sr) - 0.5px), black calc(var(--cutout-sr) + 0.5px)),
    radial-gradient(circle at 0% 0%, transparent calc(var(--cutout-sr) - 0.5px), black calc(var(--cutout-sr) + 0.5px));
  mask-image:
    linear-gradient(black, black),
    linear-gradient(black, black),
    radial-gradient(circle at 100% 0%, transparent calc(var(--cutout-r) - 0.5px), black calc(var(--cutout-r) + 0.5px)),
    radial-gradient(circle at 100% 100%, transparent calc(var(--cutout-sr) - 0.5px), black calc(var(--cutout-sr) + 0.5px)),
    radial-gradient(circle at 0% 0%, transparent calc(var(--cutout-sr) - 0.5px), black calc(var(--cutout-sr) + 0.5px));

  -webkit-mask-size:
    100% 100%,
    var(--cutout-w) var(--cutout-h),
    var(--cutout-r) var(--cutout-r),
    var(--cutout-sr) var(--cutout-sr),
    var(--cutout-sr) var(--cutout-sr);
  mask-size:
    100% 100%,
    var(--cutout-w) var(--cutout-h),
    var(--cutout-r) var(--cutout-r),
    var(--cutout-sr) var(--cutout-sr),
    var(--cutout-sr) var(--cutout-sr);

  -webkit-mask-position:
    0 0,
    right top,
    calc(100% - var(--cutout-w) + var(--cutout-r)) calc(var(--cutout-h) - var(--cutout-r)),
    calc(100% - var(--cutout-w) + var(--cutout-sr)) 0,
    right calc(var(--cutout-h) - var(--cutout-sr));
  mask-position:
    0 0,
    right top,
    calc(100% - var(--cutout-w) + var(--cutout-r)) calc(var(--cutout-h) - var(--cutout-r)),
    calc(100% - var(--cutout-w) + var(--cutout-sr)) 0,
    right calc(var(--cutout-h) - var(--cutout-sr));

  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;

  -webkit-mask-composite: source-out, source-out, source-over, source-over;
  mask-composite: subtract, subtract, add, add;
}

.ops-kpi-actions {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 0.36rem;
}

.ops-kpi-action-btn {
  width: 2.28rem;
  height: 2.28rem;
  border-radius: 999px;
  border: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
