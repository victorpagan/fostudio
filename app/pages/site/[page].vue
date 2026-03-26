<script setup lang="ts">
const route = useRoute()

const aliases: Record<string, string> = {
  landing: '/',
  memberships: '/memberships',
  equipment: '/equipment',
  faq: '/faq',
  contact: '/contact'
}

const rawPage = route.params.page
const page = typeof rawPage === 'string' ? rawPage : Array.isArray(rawPage) ? rawPage[0] : ''
const target = aliases[page]

if (!target) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

await navigateTo(target, { redirectCode: 302 })
</script>

<template>
  <div />
</template>
