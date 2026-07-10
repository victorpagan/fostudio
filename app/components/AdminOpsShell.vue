<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
}>(), {
  label: 'Scrollable page content'
})

const scrollRef = ref<HTMLElement | null>(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)
const isScrollable = computed(() => canScrollUp.value || canScrollDown.value)

let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

function updateScrollState() {
  const el = scrollRef.value
  if (!el) {
    canScrollUp.value = false
    canScrollDown.value = false
    return
  }

  const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
  canScrollUp.value = el.scrollTop > 2
  canScrollDown.value = el.scrollTop < maxScrollTop - 2
}

function onScroll() {
  updateScrollState()
}

function onResize() {
  updateScrollState()
}

onMounted(() => {
  const el = scrollRef.value
  if (el) el.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)

  if (el && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(updateScrollState)
    resizeObserver.observe(el)
  }

  if (el && typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(updateScrollState)
    mutationObserver.observe(el, { childList: true, subtree: true, characterData: true })
  }

  nextTick(updateScrollState)
})

onBeforeUnmount(() => {
  const el = scrollRef.value
  if (el) el.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  resizeObserver = null
  mutationObserver = null
})
</script>

<template>
  <div class="admin-ops-shell-frame h-full">
    <div
      class="admin-ops-shell-shadow admin-ops-shell-shadow--top"
      :class="{ 'is-visible': canScrollUp }"
      aria-hidden="true"
    />
    <div
      class="admin-ops-shell-shadow admin-ops-shell-shadow--bottom"
      :class="{ 'is-visible': canScrollDown }"
      aria-hidden="true"
    />
    <div
      ref="scrollRef"
      class="admin-ops-shell h-full overflow-y-auto p-4 sm:p-5 md:p-6 space-y-4 md:space-y-5"
      :role="isScrollable ? 'region' : undefined"
      :aria-label="isScrollable ? label : undefined"
      :tabindex="isScrollable ? 0 : undefined"
    >
      <slot />
    </div>
  </div>
</template>
