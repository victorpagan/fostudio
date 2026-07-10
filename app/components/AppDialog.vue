<script setup lang="ts">
defineOptions({ inheritAttrs: false })

type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(defineProps<{
  title: string
  description: string
  dismissible?: boolean
  scrollable?: boolean
  fullscreen?: boolean
  close?: boolean
  busy?: boolean
  size?: DialogSize
}>(), {
  dismissible: true,
  scrollable: false,
  fullscreen: false,
  close: true,
  busy: false,
  size: 'md'
})

const open = defineModel<boolean>('open', { required: true })

const contentClass = computed(() => ({
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
})[props.size])
</script>

<template>
  <UModal
    v-bind="$attrs"
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="dismissible"
    :scrollable="scrollable"
    :fullscreen="fullscreen"
    :close="close"
    :ui="{ content: contentClass }"
  >
    <template
      v-if="$slots.trigger"
      #default="{ open: isOpen }"
    >
      <slot
        name="trigger"
        :open="isOpen"
      />
    </template>

    <template
      v-if="$slots.title"
      #title
    >
      <slot name="title" />
    </template>

    <template
      v-if="$slots.description"
      #description
    >
      <slot name="description" />
    </template>

    <template
      v-if="$slots.actions"
      #actions
    >
      <slot name="actions" />
    </template>

    <template
      v-if="$slots.default"
      #body="{ close: closeDialog }"
    >
      <div :aria-busy="busy || undefined">
        <slot :close="closeDialog" />
      </div>
    </template>

    <template
      v-if="$slots.footer"
      #footer="{ close: closeDialog }"
    >
      <slot
        name="footer"
        :close="closeDialog"
      />
    </template>
  </UModal>
</template>
