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
  items: [
    {
      q: 'Do I need a membership to book the studio?',
      a: 'No. You can book as a guest for a one-off session. Membership becomes the better fit when you need repeat access, a longer booking window, and a steadier cost structure.'
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
      a: 'Yes. The guest booking flow exists for exactly that. It is a good option when you want to test the room, run a single client day, or confirm the studio fits your workflow before committing.'
    },
    {
      q: 'What happens if I need to cancel a booking?',
      a: 'Member reschedules are available until {{memberRescheduleNoticeHours}} hours before the booking start. Cancellation and refund treatment depends on timing, so if a session needs to move, do it as early as possible.'
    },
    {
      q: 'How far ahead can I book?',
      a: 'That depends on the membership tier. Higher tiers can see and reserve farther into the calendar. Guest bookings are intentionally limited to a shorter window.'
    },
    {
      q: 'Can I hold equipment or keep a setup overnight?',
      a: 'Membership tiers include a monthly overnight-hold cap. Holds require a minimum booking length and a late-enough booking end time based on studio policy. Hold time does not count toward booking hours, and door locks do not work during hold hours unless staff is contacted first.'
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
    answer: item.a.replaceAll('{{memberRescheduleNoticeHours}}', `${memberRescheduleNoticeHours.value}`)
  }))
])

const openItem = ref<number | null>(0)
</script>

<template>
  <UContainer class="faq-page py-10 sm:py-14">
    <div class="faq-layout">
      <section class="faq-hero-frame">
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

      <section class="faq-list-frame">
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
