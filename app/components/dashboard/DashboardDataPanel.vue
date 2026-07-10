<script setup lang="ts">
const props = withDefaults(defineProps<{
  listTitle?: string
  detailTitle?: string
  listDescription?: string
  detailDescription?: string
  listWidthClass?: string
  mobileDrawer?: boolean
  mobileDetailOpen?: boolean
  mobileDetailLabel?: string
  mobileBackLabel?: string
}>(), {
  listTitle: '',
  detailTitle: '',
  listDescription: '',
  detailDescription: '',
  listWidthClass: 'lg:grid-cols-[20rem_minmax(0,1fr)]',
  mobileDrawer: false,
  mobileDetailOpen: false,
  mobileDetailLabel: 'Selected item details',
  mobileBackLabel: 'Back to list'
})

const emit = defineEmits<{
  closeMobileDetail: []
}>()

const detailRef = ref<HTMLElement | null>(null)
let previousBodyOverflow = ''

function closeMobileDetail() {
  emit('closeMobileDetail')
}

function syncMobileDrawer(open: boolean) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const isMobile = window.matchMedia('(max-width: 1023px)').matches

  if (open && props.mobileDrawer && isMobile) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    void nextTick(() => detailRef.value?.focus())
    return
  }

  document.body.style.overflow = previousBodyOverflow
}

watch(
  () => props.mobileDrawer && props.mobileDetailOpen,
  syncMobileDrawer,
  { flush: 'post' }
)

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = previousBodyOverflow
})
</script>

<template>
  <div
    class="dashboard-data-panel grid gap-4"
    :class="[listWidthClass, { 'dashboard-data-panel--mobile-drawer': mobileDrawer }]"
  >
    <section class="dashboard-data-panel__list space-y-3 min-w-0">
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

    <section
      ref="detailRef"
      class="dashboard-data-panel__detail space-y-3 min-w-0"
      :class="{ 'dashboard-data-panel__detail--open': mobileDrawer && mobileDetailOpen }"
      :aria-label="mobileDrawer ? mobileDetailLabel : undefined"
      :tabindex="mobileDrawer && mobileDetailOpen ? -1 : undefined"
      @keydown.esc="closeMobileDetail"
    >
      <div
        v-if="mobileDrawer"
        class="dashboard-data-panel__mobile-header lg:hidden"
      >
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          @click="closeMobileDetail"
        >
          {{ mobileBackLabel }}
        </UButton>
      </div>
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

<style scoped>
@media (max-width: 1023px) {
  .dashboard-data-panel--mobile-drawer {
    display: block;
  }

  .dashboard-data-panel--mobile-drawer .dashboard-data-panel__detail {
    display: none;
  }

  .dashboard-data-panel--mobile-drawer .dashboard-data-panel__detail--open {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: block;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--ui-bg);
    padding: 1rem;
  }

  .dashboard-data-panel__mobile-header {
    position: sticky;
    top: -1rem;
    z-index: 2;
    margin: -1rem -1rem 0.75rem;
    border-bottom: 1px solid var(--ui-border);
    background: color-mix(in srgb, var(--ui-bg) 94%, transparent 6%);
    padding: 0.5rem 0.75rem;
    backdrop-filter: blur(12px);
  }
}
</style>
