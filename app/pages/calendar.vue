<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

type CalendarCta = {
  label: string
  to: string
}

type SiteCalendarContent = {
  hero: {
    kicker: string
    title: string
    description: string
  }
  readingPanel: {
    title: string
    points: string[]
  }
  nextMovePanel: {
    title: string
    points: string[]
    primaryCta: CalendarCta
    secondaryCta: CalendarCta
  }
}

const fallbackContent: SiteCalendarContent = {
  hero: {
    kicker: 'Open schedule',
    title: 'See when the room is clear, then build your day around it.',
    description: 'This view shows booked sessions and hold windows so you can quickly spot the best openings for portrait sets, product days, test shoots, or client work. Members can book from their dashboard. Guests can use the public booking flow.'
  },
  readingPanel: {
    title: 'Reading the calendar',
    points: [
      'Warm blocks mark hold windows where a set stays built overnight.',
      'Neutral blocks show confirmed bookings that are no longer available.',
      'Use week view for planning. Switch to day view when you need a tight read on turnaround time.'
    ]
  },
  nextMovePanel: {
    title: 'Best next move',
    points: [
      'If you are comparing plans, start with memberships so you can book with credits and priority windows.',
      'If you need a one-off date right away, guest booking is available on the public booking flow.'
    ],
    primaryCta: { label: 'Explore memberships', to: '/memberships' },
    secondaryCta: { label: 'Book as a guest', to: '/book' }
  }
}

const { data: siteCalendar } = await useAsyncData('site:calendar', async () => {
  return await queryCollection('siteCalendar').first()
})

const content = computed<SiteCalendarContent>(() => {
  return (siteCalendar.value as SiteCalendarContent | null) ?? fallbackContent
})
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <section class="studio-grid overflow-hidden rounded-[2rem] px-5 py-6 sm:px-8 sm:py-8">
      <div class="grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_20rem]">
        <div class="space-y-5">
          <span class="studio-kicker">{{ content.hero.kicker }}</span>
          <div class="max-w-3xl space-y-4">
            <h1 class="studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-7xl">
              {{ content.hero.title }}
            </h1>
            <p class="max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
              {{ content.hero.description }}
            </p>
          </div>

          <AvailabilityCalendar endpoint="/api/calendar/public" />
        </div>

        <div class="space-y-4">
          <div class="studio-panel p-5">
            <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
              {{ content.readingPanel.title }}
            </div>
            <div class="mt-4 space-y-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              <p
                v-for="point in content.readingPanel.points"
                :key="point"
              >
                {{ point }}
              </p>
            </div>
          </div>

          <div class="studio-panel p-5">
            <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
              {{ content.nextMovePanel.title }}
            </div>
            <div class="mt-4 space-y-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              <p
                v-for="point in content.nextMovePanel.points"
                :key="point"
              >
                {{ point }}
              </p>
            </div>
            <div class="mt-5 flex flex-col gap-2">
              <UButton :to="content.nextMovePanel.primaryCta.to">
                {{ content.nextMovePanel.primaryCta.label }}
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                :to="content.nextMovePanel.secondaryCta.to"
              >
                {{ content.nextMovePanel.secondaryCta.label }}
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  </UContainer>
</template>
