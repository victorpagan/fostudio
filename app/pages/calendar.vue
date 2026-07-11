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
    points: string[]
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
    points: [
      'Want to try the studio before choosing a membership? Create a free account from the signup page, then book as a guest.'
    ],
    primaryCta: { label: 'Sign up to book as a guest', to: '/signup?returnTo=/dashboard/book' },
    secondaryCta: { label: 'Compare memberships', to: '/memberships' }
  }
}

const { data: siteCalendar } = await useAsyncData('site:calendar', async () => {
  return await queryCollection('siteCalendar').first()
})

const content = computed<SiteCalendarContent>(() => {
  const source = siteCalendar.value as Partial<SiteCalendarContent> | null
  const readingPanel = source?.readingPanel ?? fallbackContent.readingPanel
  const nextMovePanel = source?.nextMovePanel ?? fallbackContent.nextMovePanel
  const secondaryCta = {
    ...fallbackContent.nextMovePanel.secondaryCta,
    ...(nextMovePanel.secondaryCta ?? {})
  }

  return {
    readingPanel: {
      ...fallbackContent.readingPanel,
      ...readingPanel,
      points: Array.isArray(readingPanel.points) && readingPanel.points.length
        ? readingPanel.points
        : fallbackContent.readingPanel.points
    },
    nextMovePanel: {
      ...fallbackContent.nextMovePanel,
      ...nextMovePanel,
      points: Array.isArray(nextMovePanel.points) && nextMovePanel.points.length
        ? nextMovePanel.points
        : fallbackContent.nextMovePanel.points,
      primaryCta: {
        ...fallbackContent.nextMovePanel.primaryCta,
        ...(nextMovePanel.primaryCta ?? {})
      },
      secondaryCta: {
        ...secondaryCta,
        to: secondaryCta.to === '/book'
          ? '/signup?returnTo=/dashboard/book'
          : secondaryCta.to
      }
    }
  }
})
</script>

<template>
  <div class="calendar-page py-10 sm:py-14">
    <section
      class="editorial-section calendar-guide-section"
      data-reveal
    >
      <div class="editorial-frame">
        <div class="calendar-guide-grid">
          <div class="calendar-guide-card">
            <p class="editorial-label">
              Reading the calendar
            </p>
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
            <p class="editorial-label">
              Next best move
            </p>
            <h2 class="calendar-guide-title">
              {{ content.nextMovePanel.title }}
            </h2>
            <div class="calendar-guide-copy">
              <p
                v-for="point in content.nextMovePanel.points"
                :key="point"
              >
                {{ point }}
              </p>
            </div>
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

    <section
      class="calendar-standalone-section"
      data-reveal
      data-reveal-delay="90ms"
    >
      <div class="calendar-standalone-shell">
        <AvailabilityCalendar
          endpoint="/api/calendar/public"
          full-day
          :show-standby-badge="false"
          :show-standby-zones="false"
          :show-past-blackout="false"
        />
      </div>
    </section>
  </div>
</template>
