<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

type SiteFaqContent = {
  hero: {
    kicker: string
    title: string
    description: string
  }
  sidePanel: {
    title: string
    body: string
    primaryCta: { label: string, to: string }
    secondaryCta: { label: string, to: string }
  }
  items: Array<{ q: string, a: string }>
}

const fallbackContent: SiteFaqContent = {
  hero: {
    kicker: 'FAQ',
    title: 'Clear answers before you commit to the next shoot.',
    description: 'These are the questions working creatives usually ask first: how booking works, how credits behave, and what changes once the studio becomes part of your regular workflow.'
  },
  sidePanel: {
    title: 'Still deciding?',
    body: 'Start with memberships if you are planning recurring work. Start with guest booking if you need one date first. If neither answer feels obvious yet, use the contact page and we can point you in the right direction.',
    primaryCta: { label: 'Compare memberships', to: '/memberships' },
    secondaryCta: { label: 'Ask a direct question', to: '/contact' }
  },
  items: []
}

const { data: bookingPolicy } = await useAsyncData('faq:bookings:policy', async () => {
  return await $fetch<{ memberRescheduleNoticeHours: number }>('/api/bookings/policy')
})
const memberRescheduleNoticeHours = computed(() => Number(bookingPolicy.value?.memberRescheduleNoticeHours ?? 24))
const { data: siteFaq } = await useAsyncData('site:faq', async () => {
  return await queryCollection('siteFaq').first()
})
const pageContent = computed<SiteFaqContent>(() => {
  return (siteFaq.value as SiteFaqContent | null) ?? fallbackContent
})

const faqs = computed(() => [
  ...(pageContent.value.items ?? []).map(item => ({
    question: item.q,
    answer: item.a.replaceAll('{{memberRescheduleNoticeHours}}', `${memberRescheduleNoticeHours.value}`)
  }))
])

const openItem = ref<number | null>(0)
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="space-y-8">
      <section class="studio-grid overflow-hidden rounded-[2rem] border border-[color:var(--gruv-line)] px-5 py-6 sm:px-8 sm:py-8">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-end">
          <div class="space-y-5">
            <span class="studio-kicker">{{ pageContent.hero.kicker }}</span>
            <div class="max-w-3xl space-y-4">
              <h1 class="studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-7xl">
                {{ pageContent.hero.title }}
              </h1>
              <p class="max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
                {{ pageContent.hero.description }}
              </p>
            </div>
          </div>

          <div class="studio-panel p-5 sm:p-6">
            <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
              {{ pageContent.sidePanel.title }}
            </div>
            <p class="mt-4 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              {{ pageContent.sidePanel.body }}
            </p>
            <div class="mt-5 flex flex-col gap-2">
              <UButton :to="pageContent.sidePanel.primaryCta.to">
                {{ pageContent.sidePanel.primaryCta.label }}
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                :to="pageContent.sidePanel.secondaryCta.to"
              >
                {{ pageContent.sidePanel.secondaryCta.label }}
              </UButton>
            </div>
          </div>
        </div>
      </section>

      <div class="mx-auto max-w-4xl space-y-4">
        <div
          v-for="(faq, index) in faqs"
          :key="faq.question"
          class="studio-panel overflow-hidden"
        >
          <button
            class="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6"
            @click="openItem = openItem === index ? null : index"
          >
            <span class="pr-4 text-base font-semibold text-[color:var(--gruv-ink-0)] sm:text-lg">
              {{ faq.question }}
            </span>
            <UIcon
              :name="openItem === index ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
              class="h-5 w-5 shrink-0 text-[color:var(--gruv-ink-2)] transition-transform"
            />
          </button>

          <div
            v-if="openItem === index"
            class="border-t border-[color:var(--gruv-line)] px-5 py-5 sm:px-6"
          >
            <p class="text-sm leading-8 text-[color:var(--gruv-ink-2)] sm:text-base">
              {{ faq.answer }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </UContainer>
</template>
