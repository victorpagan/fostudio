<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

type PolicyTab = 'privacy' | 'terms' | 'cancellations'
type PolicySection = {
  title: string
  intro: string
  blocks: Array<{
    heading: string
    body: string
  }>
}

const tabs: Array<{ key: PolicyTab, label: string }> = [
  { key: 'privacy', label: 'Privacy' },
  { key: 'terms', label: 'Terms' },
  { key: 'cancellations', label: 'Cancellations' }
]

const activeTab = ref<PolicyTab>('privacy')

const policyContent: Record<PolicyTab, PolicySection> = {
  privacy: {
    title: 'Privacy',
    intro: 'We only collect the information needed to run bookings, manage memberships, and reply to studio inquiries. The goal is straightforward operations, not broad data collection.',
    blocks: [
      {
        heading: 'What we collect',
        body: 'This can include your name, email, phone number, booking details, membership activity, and billing-related records needed to operate the studio.'
      },
      {
        heading: 'How it is used',
        body: 'We use that information to manage reservations, keep membership access in sync, process support requests, and communicate about your bookings or account.'
      },
      {
        heading: 'Payment handling',
        body: 'Payments are processed through Square. FO Studio does not store full card details directly inside the app.'
      },
      {
        heading: 'Retention and updates',
        body: 'We keep operational records as long as they are needed for bookings, customer support, and basic business administration. Policy details may be updated as the studio workflow evolves.'
      }
    ]
  },
  terms: {
    title: 'Terms',
    intro: 'Using the site or booking the studio means you are using the platform as intended: to schedule, manage, and pay for legitimate studio sessions.',
    blocks: [
      {
        heading: 'Booking use',
        body: 'Bookings should reflect real planned sessions. Members and guests are responsible for the accuracy of the time they reserve and the account details they provide.'
      },
      {
        heading: 'Account responsibility',
        body: 'You are responsible for activity under your account, including bookings, membership selections, and any studio use scheduled through your login.'
      },
      {
        heading: 'Membership structure',
        body: 'Memberships provide access based on the published tier rules, including booking window, credit release schedule, and any hold-window allowances tied to the plan.'
      },
      {
        heading: 'Operational changes',
        body: 'Studio operations, pricing, and platform details may change over time. When they do, the current published terms and plan structure apply going forward.'
      }
    ]
  },
  cancellations: {
    title: 'Cancellations',
    intro: 'The cancellation rules exist to keep the calendar usable. The closer a cancellation is to the reserved time, the harder it is to reopen that slot for someone else.',
    blocks: [
      {
        heading: 'Member bookings',
        body: 'Member sessions canceled with enough notice should return the applicable credits. Last-minute cancellations may reduce or forfeit that return depending on the final studio policy.'
      },
      {
        heading: 'Guest bookings',
        body: 'Guest bookings canceled with enough notice should return the payment to the original payment method. Last-minute cancellations are typically more restricted.'
      },
      {
        heading: 'Membership changes',
        body: 'If you end a membership, access generally continues through the end of the paid billing period unless a different written policy is stated for your plan.'
      },
      {
        heading: 'No-shows',
        body: 'A no-show can be treated as a consumed booking because the reserved time was taken off the calendar for that session.'
      }
    ]
  }
}

const currentPolicy = computed(() => policyContent[activeTab.value])
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="space-y-8">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] transition-colors"
          :class="activeTab === tab.key
            ? 'bg-[rgba(181,118,20,0.16)] text-[color:var(--gruv-accent-strong)]'
            : 'bg-[color:var(--gruv-bg-1)]/85 text-[color:var(--gruv-ink-2)] hover:bg-[rgba(181,118,20,0.08)]'"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <section class="policies-panel-grid p-5 sm:p-6">
        <div class="max-w-4xl">
          <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)] sm:text-5xl">
            {{ currentPolicy.title }}
          </div>
          <p class="mt-4 text-sm leading-8 text-[color:var(--gruv-ink-2)] sm:text-base">
            {{ currentPolicy.intro }}
          </p>
        </div>

        <div class="mt-8 grid gap-4 lg:grid-cols-2">
          <div
            v-for="block in currentPolicy.blocks"
            :key="block.heading"
            class="policies-block p-5"
          >
            <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
              {{ block.heading }}
            </div>
            <p class="mt-3 text-sm leading-8 text-[color:var(--gruv-ink-2)] sm:text-base">
              {{ block.body }}
            </p>
          </div>
        </div>
      </section>
    </div>
  </UContainer>
</template>
