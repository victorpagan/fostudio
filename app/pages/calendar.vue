<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

type CalendarCta = {
  label: string
  to: string
}

type SiteCalendarContent = {
  nextMovePanel: {
    title: string
    points: string[]
    primaryCta: CalendarCta
    secondaryCta: CalendarCta
  }
}

const fallbackContent: SiteCalendarContent = {
  nextMovePanel: {
    title: 'Best next move',
    points: [
      'Want to try the studio before choosing a membership? Create a free account from the signup page, then book as a non-member.'
    ],
    primaryCta: { label: 'Sign up to book as a non-member', to: '/signup?returnTo=/dashboard/book' },
    secondaryCta: { label: 'Compare memberships', to: '/memberships' }
  }
}

const { data: siteCalendar } = await useAsyncData('site:calendar', async () => {
  return await queryCollection('siteCalendar').first()
})

const content = computed<SiteCalendarContent>(() => {
  const source = siteCalendar.value as Partial<SiteCalendarContent> | null
  const nextMovePanel = source?.nextMovePanel ?? fallbackContent.nextMovePanel
  const secondaryCta = {
    ...fallbackContent.nextMovePanel.secondaryCta,
    ...(nextMovePanel.secondaryCta ?? {})
  }

  return {
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
        <div class="calendar-guide-grid calendar-guide-grid--single">
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
