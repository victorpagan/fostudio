<script setup lang="ts">
withDefaults(defineProps<{
  listTitle?: string
  detailTitle?: string
  listDescription?: string
  detailDescription?: string
  listWidthClass?: string
}>(), {
  listTitle: '',
  detailTitle: '',
  listDescription: '',
  detailDescription: '',
  listWidthClass: 'lg:grid-cols-[20rem_minmax(0,1fr)]'
})
</script>

<template>
  <div
    class="grid gap-4"
    :class="listWidthClass"
  >
    <section class="space-y-3 min-w-0">
      <header
        v-if="listTitle || listDescription"
        class="space-y-1"
      >
        <h2
          v-if="listTitle"
          class="text-sm font-medium"
        >
          {{ listTitle }}
        </h2>
        <p
          v-if="listDescription"
          class="text-xs text-dimmed"
        >
          {{ listDescription }}
        </p>
      </header>
      <slot name="list-controls" />
      <slot name="list" />
    </section>

    <section class="space-y-3 min-w-0">
      <header
        v-if="detailTitle || detailDescription"
        class="space-y-1"
      >
        <h2
          v-if="detailTitle"
          class="text-sm font-medium"
        >
          {{ detailTitle }}
        </h2>
        <p
          v-if="detailDescription"
          class="text-xs text-dimmed"
        >
          {{ detailDescription }}
        </p>
      </header>
      <slot name="detail-controls" />
      <slot name="detail" />
    </section>
  </div>
</template>
