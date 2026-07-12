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

type ImportantBitsPayload = {
  guest: {
    hoursLabel: string
    bookingWindowDays: number
    minBookingHours: number
    ratePerCreditCents: number
  }
  standby: {
    minOpenSlotHours: number
    discountPercent: number
  }
  membership: {
    startingPriceCents: number
    startingCreditsPerMonth: number
  } | null
}

const fallbackContent: SiteFaqContent = {
  hero: {
    kicker: 'FAQ',
    title: 'Clear answers before you commit to the next shoot.',
    description: 'These are the questions working creatives usually ask first: how booking works, how credits behave, and what changes once the studio becomes part of your regular workflow.'
  },
  sidePanel: {
    title: 'Still deciding?',
    body: 'Start with a membership if you are planning recurring work. Start with non-member booking if you need one date first. If neither answer feels obvious yet, use the contact page and we can point you in the right direction.',
    primaryCta: { label: 'Compare memberships', to: '/memberships' },
    secondaryCta: { label: 'Ask a direct question', to: '/contact' }
  },
  items: [
    {
      q: 'Do I need a membership to book the studio?',
      a: 'No. Create a free account from the signup page, then book as a non-member from the dashboard. Membership becomes the better fit when you need repeat access, a longer booking window, lower effective rates, and member benefits.'
    },
    {
      q: 'How does non-member booking work?',
      a: 'Non-members can book between {{nonMemberHours}}, up to {{nonMemberWindowDays}} days ahead. Sessions require at least {{nonMemberMinHours}} hours and use whole-hour increments. Off-peak time uses 1 credit per hour, while peak time uses the non-member peak rate. Pay-at-booking credit shortfalls are {{nonMemberCreditRate}} per credit, discounted packs are available separately, and purchased credits expire after 30 days. Overnight holds are not included.'
    },
    {
      q: 'How does standby booking work?',
      a: 'Standby is a same-day option when at least {{standbyMinHours}} continuous hours are open. It uses {{standbyDiscountPercent}}% fewer credits after normal peak pricing is calculated. Standby is limited to one booking per day and cannot be held, canceled, moved, or extended.'
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
      a: 'Off-peak time uses the base rate of 1 credit per hour. Peak windows use the tier’s peak-hour credit rate (for example 2, 1.5, or 1.25 credits per hour) so the calendar stays fair during the busiest production hours.'
    },
    {
      q: 'Can I try the studio before joining a membership?',
      a: 'Yes. Non-member booking exists for exactly that. Sign up for a free account, then book a session if you want to test the room, run a single client day, or confirm the studio fits your workflow before committing.'
    },
    {
      q: 'What happens if I need to cancel a booking?',
      a: 'Member reschedules are available until {{memberRescheduleNoticeHours}} hours before the booking start. Cancellation and refund treatment depends on timing, so if a session needs to move, do it as early as possible.'
    },
    {
      q: 'How far ahead can I book?',
      a: 'That depends on the membership tier. Higher tiers can see and reserve farther into the calendar. Non-member bookings are currently limited to {{nonMemberWindowDays}} days ahead.'
    },
    {
      q: 'Can I hold equipment or keep a setup overnight?',
      a: 'Membership tiers include a monthly overnight-hold cap. Holds require a minimum booking length and a late-enough booking end time based on studio policy. Hold time does not count toward booking hours, and door locks do not work during hold hours unless staff is contacted first.'
    },
    {
      q: 'Can I host a workshop or event?',
      a: 'Workshop booking is available to approved member accounts. It can include a public title, description, and link on the booking calendar. Workshop time uses a higher credit multiplier and requires the host to acknowledge responsibility for attendees.'
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
  return await $fetch<{ memberRescheduleNoticeHours: number }>('/api/bookings/policy')
})
const memberRescheduleNoticeHours = computed(() => Number(bookingPolicy.value?.memberRescheduleNoticeHours ?? 24))
const { data: importantBitsData } = await useAsyncData('faq:important-bits', async () => {
  try {
    return await $fetch<ImportantBitsPayload>('/api/site/important-bits')
  } catch {
    return null
  }
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

const faqs = computed(() => [
  ...(pageContent.value.items ?? []).map(item => ({
    question: item.q,
    answer: item.a
      .replaceAll('{{memberRescheduleNoticeHours}}', `${memberRescheduleNoticeHours.value}`)
      .replaceAll('{{nonMemberHours}}', importantBitsData.value?.guest.hoursLabel ?? '9 AM–9 PM')
      .replaceAll('{{nonMemberWindowDays}}', `${importantBitsData.value?.guest.bookingWindowDays ?? 20}`)
      .replaceAll('{{nonMemberMinHours}}', `${importantBitsData.value?.guest.minBookingHours ?? 2}`)
      .replaceAll('{{nonMemberCreditRate}}', formatCurrency(importantBitsData.value?.guest.ratePerCreditCents ?? 5000))
      .replaceAll('{{standbyMinHours}}', `${importantBitsData.value?.standby.minOpenSlotHours ?? 3}`)
      .replaceAll('{{standbyDiscountPercent}}', `${importantBitsData.value?.standby.discountPercent ?? 50}`)
  }))
])

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2
  }).format(cents / 100)
}

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
              FAQ
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
        <div
          v-for="(faq, index) in faqs"
          :key="faq.question"
          class="faq-item"
        >
          <button
            class="faq-item-trigger"
            @click="openItem = openItem === index ? null : index"
          >
            <span class="faq-item-question">
              {{ faq.question }}
            </span>
            <UIcon
              :name="openItem === index ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
              class="faq-item-chevron"
            />
          </button>

          <div
            v-if="openItem === index"
            class="faq-item-content"
          >
            <p class="faq-item-answer">
              {{ faq.answer }}
            </p>
          </div>
        </div>
      </section>
    </div>
  </UContainer>
</template>
