<script setup lang="ts">
const colorMode = useColorMode()
const route = useRoute()

const color = computed(() => colorMode.value === 'dark' ? '#131413' : '#FCFAED')
const sitePageTransition = { name: 'site-page', mode: 'out-in' as const }

const pageTransition = computed(() => {
  if (route.path.startsWith('/dashboard')) {
    return false
  }

  return sitePageTransition
})

useHead({
  titleTemplate: title => title ? `${title} | FO Studio` : 'FO Studio',
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage
        :transition="pageTransition"
        :page-key="to => to.fullPath"
      />
    </NuxtLayout>
  </UApp>
</template>
