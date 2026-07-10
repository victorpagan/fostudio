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

type BookingPolicy = {
  guestBookingWindowDays: number
  guestBookingStartHour: number
  guestBookingEndHour: number
  guestMinBookingHours: number
  guestBookingIncrementMinutes: number
}

type CatalogTier = {
  id: string
  adminOnly?: boolean
  booking_window_days: number
}

const fallbackContent: SiteCalendarContent = {
  hero: {
    kicker: 'Availability',
    title: 'Check real studio availability before you create an account.',
    description: 'Occupied blocks come from the public calendar feed. Select an eligible open guest time to carry it into signup, or compare memberships for 24/7 access and longer planning reach.'
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
      'Want to try the studio before choosing a membership? Create a free account from the signup page, then book as a guest.'
    ],
    primaryCta: { label: 'Sign up to book as a guest', to: '/signup?returnTo=/dashboard/book' },
    secondaryCta: { label: 'Compare memberships', to: '/memberships' }
  }
}

const { data: siteCalendar } = await useAsyncData('site:calendar', async () => {
  return await queryCollection('siteCalendar').first()
})

usePublicSeo(() => resolvePublicSeo(siteCalendar.value, {
  title: 'Studio Availability Calendar | FO Studio Los Angeles',
  description: 'Check live FO Studio availability, current guest booking constraints, and member booking options before creating an account.',
  canonicalPath: '/calendar',
  schemaType: 'WebPage',
  keywords: ['studio availability calendar', 'book photo studio Los Angeles', 'guest studio booking']
}))

const { data: bookingPolicy } = await useFetch<BookingPolicy>('/api/bookings/policy')
const { data: catalog } = await useFetch<{ tiers: CatalogTier[] }>('/api/membership/catalog', {
  default: () => ({ tiers: [] })
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
    hero: {
      ...fallbackContent.hero,
      ...(source?.hero ?? {})
    },
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

const publicTierWindows = computed(() => (catalog.value?.tiers ?? [])
  .filter(tier => !tier.adminOnly && tier.id !== 'test')
  .map(tier => Number(tier.booking_window_days))
  .filter(value => Number.isFinite(value) && value > 0))

const memberWindowLabel = computed(() => {
  if (!publicTierWindows.value.length) return 'Tier-specific booking reach'
  const minimum = Math.min(...publicTierWindows.value)
  const maximum = Math.max(...publicTierWindows.value)
  if (minimum === maximum) return `${minimum} days ahead`
  return `${minimum}-${maximum} days ahead, depending on tier`
})

const selectedTime = ref<{ start: Date, end: Date, rateKind: 'standard' | 'standby' } | null>(null)

function handleCalendarSelect(payload: { start: Date, end: Date, rateKind?: 'standard' | 'standby' }) {
  selectedTime.value = {
    start: payload.start,
    end: payload.end,
    rateKind: payload.rateKind ?? 'standard'
  }
}

function formatHour(hour: number | null | undefined) {
  const parsed = Number(hour)
  const normalized = Number.isFinite(parsed) ? Math.max(0, Math.min(24, Math.floor(parsed))) : 0
  if (normalized === 24) return '12 AM'
  const suffix = normalized >= 12 ? 'PM' : 'AM'
  return `${normalized % 12 || 12} ${suffix}`
}

function formatHours(value: number | null | undefined) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '2 hours'
  if (parsed === 1) return '1 hour'
  return `${parsed.toFixed(Number.isInteger(parsed) ? 0 : 1)} hours`
}

function formatSelectedTime(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short'
  }).format(value)
}

const selectedTimeLabel = computed(() => {
  if (!selectedTime.value) return null
  return `${formatSelectedTime(selectedTime.value.start)} to ${formatSelectedTime(selectedTime.value.end)}`
})

const signupWithIntentTo = computed(() => {
  if (!selectedTime.value) return content.value.nextMovePanel.primaryCta.to
  const bookingQuery = new URLSearchParams({
    start: selectedTime.value.start.toISOString(),
    end: selectedTime.value.end.toISOString(),
    rateKind: selectedTime.value.rateKind
  })
  const returnTo = `/dashboard/book?${bookingQuery.toString()}`
  return `/signup?returnTo=${encodeURIComponent(returnTo)}`
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
              {{ content.hero.kicker }}
            </p>
            <h1 class="editorial-title mt-2">
              {{ content.hero.title }}
            </h1>
            <p class="editorial-body">
              {{ content.hero.description }}
            </p>
            <h2 class="calendar-guide-title mt-6">
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
            <p class="mt-4 text-xs leading-6 text-[color:var(--gruv-ink-2)]">
              Standby is intentionally discoverable only when the live feed marks an eligible same-day opening. Booking preview remains the final check for rate and eligibility.
            </p>
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
              <p>
                <strong>Current guest policy:</strong>
                up to {{ bookingPolicy?.guestBookingWindowDays ?? 20 }} days ahead,
                {{ formatHour(bookingPolicy?.guestBookingStartHour ?? 9) }}-{{ formatHour(bookingPolicy?.guestBookingEndHour ?? 21) }},
                {{ formatHours(bookingPolicy?.guestMinBookingHours ?? 2) }} minimum,
                {{ bookingPolicy?.guestBookingIncrementMinutes ?? 60 }}-minute increments.
              </p>
              <p>
                <strong>Current member range:</strong> {{ memberWindowLabel }}, with 24/7 access and 30-minute increments.
              </p>
            </div>
            <div class="calendar-guide-actions">
              <UButton :to="signupWithIntentTo">
                {{ selectedTime ? 'Continue with selected time' : content.nextMovePanel.primaryCta.label }}
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
        <div
          v-if="selectedTime && selectedTimeLabel"
          class="mb-3 border border-[color:var(--gruv-line)] bg-[color:var(--gruv-bg-0)] p-4"
          aria-live="polite"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--gruv-ink-2)]">
                Selected {{ selectedTime.rateKind === 'standby' ? 'standby request' : 'guest time' }}
              </p>
              <p class="mt-1 font-semibold text-[color:var(--gruv-ink-0)]">
                {{ selectedTimeLabel }}
              </p>
              <p class="mt-1 text-xs leading-5 text-[color:var(--gruv-ink-2)]">
                This selection will be carried into signup and the booking return URL. Availability and price are confirmed again in the authenticated booking preview.
              </p>
            </div>
            <UButton :to="signupWithIntentTo">
              Create account to continue
            </UButton>
          </div>
        </div>
        <AvailabilityCalendar
          endpoint="/api/calendar/public"
          full-day
          :show-standby-badge="true"
          :show-standby-zones="true"
          :show-past-blackout="false"
          @select="handleCalendarSelect"
        />
      </div>
    </section>
  </div>
</template>
