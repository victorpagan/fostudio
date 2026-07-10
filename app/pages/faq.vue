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

type BookingPolicy = {
  memberRescheduleNoticeHours: number
  guestBookingWindowDays: number
  guestBookingStartHour: number
  guestBookingEndHour: number
  guestMinBookingHours: number
  guestBookingIncrementMinutes: number
  workshopCreditMultiplier: number
}

type CatalogTier = {
  id: string
  adminOnly?: boolean
  booking_window_days: number
  peak_multiplier: number
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
  items: [
    {
      q: 'Do I need a membership to book the studio?',
      a: 'No. Create an account, then book under the current guest policy. Membership is designed for recurring access and adds tier-based booking reach, member credits, and included benefits.'
    },
    {
      q: 'What is different about guest and member booking?',
      a: 'Guests currently book up to {{guestBookingWindowDays}} days ahead, during {{guestBookingHours}}, with a {{guestMinimum}} minimum and {{guestIncrement}} increments. Members have 24/7 access, 30-minute increments, tier-based booking windows, and member credits and benefits.'
    },
    {
      q: 'What is included with memberships?',
      a: 'Memberships include studio equipment, backdrop paper, props, and standard consumables. The goal is to keep your production day simple: book, pay, and show up prepared to shoot.'
    },
    {
      q: 'How do membership credits work on quarterly and annual plans?',
      a: 'Credits still release month by month. Even if you are billed quarterly or annually, the usable credit balance is added on a monthly schedule so it stays predictable.'
    },
    {
      q: 'When does a membership upgrade or downgrade take effect?',
      a: 'Plan changes are scheduled to your next billing cycle. We do not apply prorated mid-cycle membership changes. Your current plan stays active until the cycle rolls over.'
    },
    {
      q: 'What makes the studio production-ready?',
      a: 'The space is built around a 25x30 ft cyclorama with 20+ ft ceilings, a makeup area, client seating/staging space, and layout flexibility for small-to-mid-size teams.'
    },
    {
      q: 'What is the difference between peak and off-peak time?',
      a: 'Off-peak member time uses the base rate of 1 credit per hour. Peak windows use the live multiplier for the selected tier, currently {{peakRateRange}}. Booking preview identifies peak time before confirmation.'
    },
    {
      q: 'Can I try the studio before joining a membership?',
      a: 'Yes. The guest booking flow exists for exactly that. Sign up for a free account, then book a guest session if you want to test the room, run a single client day, or confirm the studio fits your workflow before committing.'
    },
    {
      q: 'What happens if I need to cancel a booking?',
      a: 'Standard member reschedules are available until {{memberRescheduleNoticeHours}} hours before the booking start. The dashboard asks the server to confirm cancellation eligibility and any credit return. Standby bookings cannot be canceled, rescheduled, or extended after purchase.'
    },
    {
      q: 'How far ahead can I book?',
      a: 'Guests currently book up to {{guestBookingWindowDays}} days ahead. Public membership tiers currently provide {{memberBookingWindowRange}} of booking reach, depending on the tier.'
    },
    {
      q: 'Can I hold equipment or keep a setup overnight?',
      a: 'Membership tiers include a monthly overnight-hold cap. Holds require a minimum booking length and a late-enough booking end time based on studio policy. Hold time does not count toward booking hours, and door locks do not work during hold hours unless staff is contacted first.'
    },
    {
      q: 'How does same-day standby work?',
      a: 'Standby appears only when the live calendar identifies an eligible same-day opening. Booking preview confirms the rate and eligibility, and only one standby booking is allowed per account per day. Purchased standby bookings cannot be canceled, rescheduled, extended, or chained.'
    },
    {
      q: 'Who can use a referral code?',
      a: 'A referral code applies only to a new member’s first successful activation. It must belong to another currently entitled member. Live tier and cadence rules determine reward credits after activation.'
    },
    {
      q: 'Who can create a workshop booking?',
      a: 'Workshop-hosting mode requires an authenticated account with an active membership and workshop booking enabled for that account. Workshop time currently uses {{workshopMultiplier}}x credits.'
    },
    {
      q: 'Do you support film shooters?',
      a: 'Yes. Film photographers are welcome, and rush-fee waivers are available when the lab is open and there is processing capacity.'
    },
    {
      q: 'What if I am not sure which plan fits?',
      a: 'Feel free to contact us directly. Share how often you shoot, how far ahead your client work needs planning, and whether you mostly work solo or with a team. The right plan is the one that matches your real workflow, not the biggest one.'
    }
  ]
}

const { data: bookingPolicy } = await useAsyncData('faq:bookings:policy', async () => {
  return await $fetch<BookingPolicy>('/api/bookings/policy')
})
const memberRescheduleNoticeHours = computed(() => Number(bookingPolicy.value?.memberRescheduleNoticeHours ?? 24))
const { data: catalog } = await useFetch<{ tiers: CatalogTier[] }>('/api/membership/catalog', {
  default: () => ({ tiers: [] })
})
const { data: siteFaq } = await useAsyncData('site:faq', async () => {
  try {
    return await queryCollection('siteFaq').first()
  } catch {
    return null
  }
})
const pageContent = computed<SiteFaqContent>(() => {
  return (siteFaq.value as SiteFaqContent | null) ?? fallbackContent
})

const publicTiers = computed(() => (catalog.value?.tiers ?? [])
  .filter(tier => !tier.adminOnly && tier.id !== 'test'))

const memberBookingWindowRange = computed(() => {
  const values = publicTiers.value
    .map(tier => Number(tier.booking_window_days))
    .filter(value => Number.isFinite(value) && value > 0)
  if (!values.length) return 'tier-specific'
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  return minimum === maximum ? `${minimum} days` : `${minimum}-${maximum} days`
})

const peakRateRange = computed(() => {
  const values = publicTiers.value
    .map(tier => Number(tier.peak_multiplier))
    .filter(value => Number.isFinite(value) && value >= 1)
  if (!values.length) return 'the rate shown on each live plan'
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const format = (value: number) => Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '')
  return minimum === maximum ? `${format(minimum)}x` : `${format(minimum)}x-${format(maximum)}x`
})

function formatHour(hour: number | null | undefined) {
  const parsed = Number(hour)
  const normalized = Number.isFinite(parsed) ? Math.max(0, Math.min(24, Math.floor(parsed))) : 0
  if (normalized === 24) return '12 AM'
  return `${normalized % 12 || 12} ${normalized >= 12 ? 'PM' : 'AM'}`
}

function formatHours(value: number | null | undefined) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '2-hour'
  return `${parsed.toFixed(Number.isInteger(parsed) ? 0 : 1)}-hour`
}

function resolveAnswer(answer: string) {
  return answer
    .replaceAll('{{memberRescheduleNoticeHours}}', `${memberRescheduleNoticeHours.value}`)
    .replaceAll('{{guestBookingWindowDays}}', `${bookingPolicy.value?.guestBookingWindowDays ?? 20}`)
    .replaceAll('{{guestBookingHours}}', `${formatHour(bookingPolicy.value?.guestBookingStartHour ?? 9)}-${formatHour(bookingPolicy.value?.guestBookingEndHour ?? 21)} Los Angeles time`)
    .replaceAll('{{guestMinimum}}', formatHours(bookingPolicy.value?.guestMinBookingHours ?? 2))
    .replaceAll('{{guestIncrement}}', `${bookingPolicy.value?.guestBookingIncrementMinutes ?? 60}-minute`)
    .replaceAll('{{memberBookingWindowRange}}', memberBookingWindowRange.value)
    .replaceAll('{{peakRateRange}}', peakRateRange.value)
    .replaceAll('{{workshopMultiplier}}', `${bookingPolicy.value?.workshopCreditMultiplier ?? 2}`)
}

const faqs = computed(() => [
  ...(pageContent.value.items ?? []).map(item => ({
    question: item.q,
    answer: resolveAnswer(item.a)
  }))
])

usePublicSeo(() => {
  const seo = resolvePublicSeo(siteFaq.value, {
    title: 'FO Studio FAQ | Memberships, Credits, Booking & Holds',
    description: 'Verified answers about FO Studio memberships, guest booking, credits, standby, referrals, workshops, equipment, and holds.',
    canonicalPath: '/faq',
    schemaType: 'FAQPage',
    keywords: ['photo studio FAQ', 'membership credits', 'guest studio booking']
  })

  return {
    ...seo,
    structuredData: {
      '@type': 'FAQPage',
      'name': seo.title,
      'description': seo.description,
      'mainEntity': faqs.value.map(faq => ({
        '@type': 'Question',
        'name': faq.question,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': faq.answer
        }
      }))
    }
  }
})

const openItem = ref<number | null>(0)
</script>

<template>
  <UContainer class="faq-page py-10 sm:py-14">
    <div class="faq-layout">
      <section
        class="faq-hero-frame"
        data-reveal
      >
        <div class="faq-hero-grid">
          <div class="faq-hero-main">
            <p class="editorial-label">
              {{ pageContent.hero.kicker }}
            </p>
            <h1 class="editorial-title mt-2">
              {{ pageContent.hero.title }}
            </h1>
            <p class="editorial-body">
              {{ pageContent.hero.description }}
            </p>
          </div>

          <div class="faq-side-panel">
            <div class="faq-side-title">
              {{ pageContent.sidePanel.title }}
            </div>
            <p class="faq-side-body">
              {{ pageContent.sidePanel.body }}
            </p>
            <div class="faq-side-actions">
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

      <section
        class="faq-list-frame"
        data-reveal
        data-reveal-delay="85ms"
      >
        <article
          v-for="(faq, index) in faqs"
          :key="faq.question"
          class="faq-item"
        >
          <h2 class="m-0">
            <button
              :id="`faq-trigger-${index}`"
              type="button"
              class="faq-item-trigger"
              :aria-expanded="openItem === index"
              :aria-controls="`faq-panel-${index}`"
              @click="openItem = openItem === index ? null : index"
            >
              <span class="faq-item-question">
                {{ faq.question }}
              </span>
              <UIcon
                :name="openItem === index ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="faq-item-chevron"
              />
            </button>
          </h2>

          <div
            v-if="openItem === index"
            :id="`faq-panel-${index}`"
            class="faq-item-content"
            role="region"
            :aria-labelledby="`faq-trigger-${index}`"
          >
            <p class="faq-item-answer">
              {{ faq.answer }}
            </p>
          </div>
        </article>
      </section>
    </div>
  </UContainer>
</template>
