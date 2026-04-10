<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { RouteLocationRaw } from 'vue-router'

type ActionColor = 'primary' | 'neutral' | 'success' | 'warning' | 'error' | 'info'
type ActionVariant = 'solid' | 'soft' | 'ghost' | 'outline' | 'subtle'

type DashboardAction = {
  label: string
  icon?: string
  to?: RouteLocationRaw
  color?: ActionColor
  variant?: ActionVariant
  disabled?: boolean
  loading?: boolean
  onSelect?: () => void
}

const props = withDefaults(defineProps<{
  primary?: DashboardAction | null
  secondary?: DashboardAction[]
  tertiary?: DashboardAction[]
  align?: 'start' | 'end'
}>(), {
  primary: null,
  secondary: () => [],
  tertiary: () => [],
  align: 'end'
})

function runAction(action: DashboardAction) {
  if (action.disabled || action.loading) return
  action.onSelect?.()
}

const tertiaryItems = computed<DropdownMenuItem[][]>(() => {
  if (!props.tertiary.length) return []
  return [props.tertiary.map(action => ({
    label: action.label,
    icon: action.icon,
    disabled: action.disabled,
    onSelect: (event: Event) => {
      event.preventDefault()
      runAction(action)
    }
  }))]
})
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2"
    :class="align === 'end' ? 'justify-end' : 'justify-start'"
  >
    <slot name="leading" />

    <UButton
      v-for="action in secondary"
      :key="`secondary-${action.label}`"
      size="sm"
      :color="action.color ?? 'neutral'"
      :variant="action.variant ?? 'soft'"
      :icon="action.icon"
      :to="action.to"
      :disabled="action.disabled"
      :loading="action.loading"
      @click="runAction(action)"
    >
      {{ action.label }}
    </UButton>

    <UDropdownMenu
      v-if="tertiaryItems.length > 0"
      :items="tertiaryItems"
      :content="{ align: 'end' }"
    >
      <UButton
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-ellipsis"
        aria-label="More actions"
      />
    </UDropdownMenu>

    <UButton
      v-if="primary"
      size="sm"
      :color="primary.color ?? 'primary'"
      :variant="primary.variant ?? 'solid'"
      :icon="primary.icon"
      :to="primary.to"
      :disabled="primary.disabled"
      :loading="primary.loading"
      @click="runAction(primary)"
    >
      {{ primary.label }}
    </UButton>

    <slot />
  </div>
</template>
