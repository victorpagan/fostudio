<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const { data: bookingPolicy } = await useAsyncData('faq:bookings:policy', async () => {
  return await $fetch<{ memberRescheduleNoticeHours: number }>('/api/bookings/policy')
})
const memberRescheduleNoticeHours = computed(() => Number(bookingPolicy.value?.memberRescheduleNoticeHours ?? 24))

const faqs = computed(() => [
  {
    question: 'Do I need a membership to book the studio?',
    answer: 'No. You can book as a guest for a one-off session. Membership becomes the better fit when you need repeat access, a longer booking window, and a steadier cost structure.'
  },
  {
    question: 'What is included with memberships?',
    answer: 'Memberships include studio equipment, backdrop paper, props, and standard consumables. The goal is to keep your production day simple: book, pay, and show up prepared to shoot.'
  },
  {
    question: 'How do membership credits work on quarterly and annual plans?',
    answer: 'Credits still release month by month. Even if you are billed quarterly or annually, the usable credit balance is added on a monthly schedule so it stays predictable.'
  },
  {
    question: 'When does a membership upgrade or downgrade take effect?',
    answer: 'Plan changes are scheduled to your next billing cycle. We do not apply prorated mid-cycle membership changes. Your current plan stays active until the cycle rolls over.'
  },
  {
    question: 'What makes the studio production-ready?',
    answer: 'The space is built around a 25x30 ft cyclorama with 20+ ft ceilings, a makeup area, client seating/staging space, and layout flexibility for small-to-mid-size teams.'
  },
  {
    question: 'What is the difference between peak and off-peak time?',
    answer: 'Off-peak time uses the base rate of 1 credit per hour. Peak windows use the tier’s peak-hour credit rate (for example 2, 1.5, or 1.25 credits per hour) so the calendar stays fair during the busiest production hours.'
  },
  {
    question: 'Can I try the studio before joining a membership?',
    answer: 'Yes. The guest booking flow exists for exactly that. It is a good option when you want to test the room, run a single client day, or confirm the studio fits your workflow before committing.'
  },
  {
    question: 'What happens if I need to cancel a booking?',
    answer: `Member reschedules are available until ${memberRescheduleNoticeHours.value} hours before the booking start. Cancellation and refund treatment depends on timing, so if a session needs to move, do it as early as possible.`
  },
  {
    question: 'How far ahead can I book?',
    answer: 'That depends on the membership tier. Higher tiers can see and reserve farther into the calendar. Guest bookings are intentionally limited to a shorter window.'
  },
  {
    question: 'Can I hold equipment or keep a setup overnight?',
    answer: 'Membership tiers include a monthly overnight-hold cap. Each hold runs until the earlier of 10:00am next day or peak-hours start, and once the monthly cap is used you can still buy extra hold add-ons.'
  },
  {
    question: 'Do you support film shooters?',
    answer: 'Yes. Film photographers are welcome, and rush-fee waivers are available when the lab is open and there is processing capacity.'
  },
  {
    question: 'What if I am not sure which plan fits?',
    answer: 'That is what the contact page is for. Share how often you shoot, how far ahead your client work needs planning, and whether you mostly work solo or with a team. The right plan is the one that matches your real rhythm, not the biggest one.'
  }
])

const openItem = ref<number | null>(0)
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="space-y-8">
      <section class="studio-grid overflow-hidden rounded-[2rem] border border-[color:var(--gruv-line)] px-5 py-6 sm:px-8 sm:py-8">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-end">
          <div class="space-y-5">
            <span class="studio-kicker">FAQ</span>
            <div class="max-w-3xl space-y-4">
              <h1 class="studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-7xl">
                Clear answers before you commit to the next shoot.
              </h1>
              <p class="max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
                These are the questions working creatives usually ask first: how booking works, how credits behave,
                and what changes once the studio becomes part of your regular workflow.
              </p>
            </div>
          </div>

          <div class="studio-panel p-5 sm:p-6">
            <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
              Still deciding?
            </div>
            <p class="mt-4 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              Start with memberships if you are planning recurring work. Start with guest booking if you need one date first.
              If neither answer feels obvious yet, use the contact page and we can point you in the right direction.
            </p>
            <div class="mt-5 flex flex-col gap-2">
              <UButton to="/memberships">
                Compare memberships
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                to="/contact"
              >
                Ask a direct question
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
