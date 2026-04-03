<script setup lang="ts">
const scrollRef = ref<HTMLElement | null>(null)
const canScrollUp = ref(false)
const canScrollDown = ref(false)

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
  nextTick(updateScrollState)
})

onBeforeUnmount(() => {
  const el = scrollRef.value
  if (el) el.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="admin-ops-shell-frame h-full">
    <div
      class="admin-ops-shell-shadow admin-ops-shell-shadow--top"
      :class="{ 'is-visible': canScrollUp }"
    />
    <div
      class="admin-ops-shell-shadow admin-ops-shell-shadow--bottom"
      :class="{ 'is-visible': canScrollDown }"
    />
    <div
      ref="scrollRef"
      class="admin-ops-shell h-full overflow-y-auto p-4 sm:p-5 md:p-6 space-y-4 md:space-y-5"
    >
      <slot />
    </div>
  </div>
</template>
