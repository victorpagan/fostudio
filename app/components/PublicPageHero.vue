<script setup lang="ts">
const props = withDefaults(defineProps<{
  id?: string
  title: string
  eyebrow?: string
  description?: string
  compact?: boolean
}>(), {
  id: undefined,
  eyebrow: undefined,
  description: undefined,
  compact: false
})

const generatedId = useId()
const titleId = computed(() => props.id || `public-page-title-${generatedId}`)
</script>

<template>
  <header
    class="public-page-hero"
    :class="{ 'public-page-hero--compact': compact }"
    :aria-labelledby="titleId"
  >
    <div class="public-page-hero__content">
      <p
        v-if="eyebrow || $slots.eyebrow"
        class="public-page-hero__eyebrow"
      >
        <slot name="eyebrow">
          {{ eyebrow }}
        </slot>
      </p>
      <h1
        :id="titleId"
        class="public-page-hero__title"
      >
        <slot name="title">
          {{ title }}
        </slot>
      </h1>
      <p
        v-if="description || $slots.description"
        class="public-page-hero__description"
      >
        <slot name="description">
          {{ description }}
        </slot>
      </p>
      <div
        v-if="$slots.actions"
        class="public-page-hero__actions"
      >
        <slot name="actions" />
      </div>
    </div>

    <div
      v-if="$slots.media"
      class="public-page-hero__media"
    >
      <slot name="media" />
    </div>
  </header>
</template>
