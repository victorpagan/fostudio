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

const hasActions = computed(() => props.showLinkAction || props.showNotificationAction)
const hasLinkNavigation = computed(() => Boolean(props.linkTo) && !props.linkDisabled)

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
        :disabled="notificationDisabled"
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
}

.ops-kpi-card {
  height: 100%;
}

.ops-kpi-card--with-actions {
  overflow: hidden;
  clip-path: polygon(0 0, calc(100% - 4.9rem) 0, calc(100% - 4.9rem) 2.3rem, 100% 2.3rem, 100% 100%, 0 100%);
}

.ops-kpi-actions {
  position: absolute;
  top: 0.4rem;
  right: 0.45rem;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.ops-kpi-action-btn {
  width: 2.2rem;
  height: 2.2rem;
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
