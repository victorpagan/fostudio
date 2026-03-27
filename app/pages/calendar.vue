<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

type CalendarCta = {
  label: string
  to: string
}

type SiteCalendarContent = {
  readingPanel: {
    title: string
    points: string[]
  }
  nextMovePanel: {
    title: string
    primaryCta: CalendarCta
    secondaryCta: CalendarCta
  }
}

const fallbackContent: SiteCalendarContent = {
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
  <div class="calendar-page py-10 sm:py-14">
    <section class="editorial-section calendar-guide-section">
      <div class="editorial-frame">
        <div class="calendar-guide-grid">
          <div class="calendar-guide-card">
            <p class="editorial-label">Reading the calendar</p>
            <h2 class="calendar-guide-title">
              {{ content.readingPanel.title }}
            </h2>
            <div class="calendar-guide-copy">
              <p
                v-for="point in content.readingPanel.points"
                :key="point"
              >
                {{ point }}
              </p>
            </div>
          </div>

          <div class="calendar-guide-card calendar-guide-next">
            <p class="editorial-label">Next best move</p>
            <h2 class="calendar-guide-title">
              {{ content.nextMovePanel.title }}
            </h2>
            <div class="calendar-guide-actions">
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

    <section class="calendar-standalone-section">
      <div class="calendar-standalone-shell">
        <AvailabilityCalendar
          endpoint="/api/calendar/public"
          full-day
        />
      </div>
    </section>
  </div>
</template>
