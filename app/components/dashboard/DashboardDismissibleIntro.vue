<script setup lang="ts">
const props = withDefaults(defineProps<{
  storageKey: string
  title: string
  description?: string
  icon?: string
  color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
  variant?: 'solid' | 'outline' | 'soft' | 'subtle'
}>(), {
  description: undefined,
  icon: 'i-lucide-info',
  color: 'info',
  variant: 'soft'
})

const visible = ref(false)

const resolvedStorageKey = computed(() => `fostudio.dashboardIntro.${props.storageKey}`)

onMounted(() => {
  if (!import.meta.client) return
  visible.value = localStorage.getItem(resolvedStorageKey.value) !== 'dismissed'
})

function dismiss() {
  visible.value = false
  if (import.meta.client) {
    localStorage.setItem(resolvedStorageKey.value, 'dismissed')
  }
}
</script>

<template>
  <UAlert
    v-if="visible"
    :color="color"
    :variant="variant"
    :icon="icon"
    :title="title"
    :description="description"
  >
    <template
      v-if="$slots.description"
      #description
    >
      <slot name="description" />
    </template>

    <template #actions>
      <div class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          @click="dismiss"
        >
          Dismiss
        </UButton>
      </div>
    </template>
  </UAlert>
</template>
