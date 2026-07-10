<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

type PolicySection = {
  id: 'privacy' | 'terms' | 'cancellations'
  title: string
  intro: string
  blocks: Array<{
    heading: string
    body: string
  }>
}

type BookingPolicy = {
  memberRescheduleNoticeHours: number
}

const { data: bookingPolicy } = await useFetch<BookingPolicy>('/api/bookings/policy')
const memberNoticeHours = computed(() => Number(bookingPolicy.value?.memberRescheduleNoticeHours ?? 24))

const policySections = computed<PolicySection[]>(() => [
  {
    id: 'privacy',
    title: 'Privacy notice',
    intro: 'This section describes the data the FO Studio application uses to operate accounts, bookings, memberships, access, payments, and support. It does not promise a fixed retention period or expand rights beyond applicable law.',
    blocks: [
      {
        heading: 'Account and studio records',
        body: 'The application processes information such as your name, email, phone number, account profile, waiver state, booking details, membership and credit activity, access events, and messages sent to the studio.'
      },
      {
        heading: 'Operational use',
        body: 'FO Studio uses these records to authenticate accounts, quote and manage bookings, administer memberships and credits, coordinate studio access, send transactional messages, prevent abuse, and answer support requests.'
      },
      {
        heading: 'Payments and service providers',
        body: 'Square processes card payments and saved payment methods. The FO Studio application stores transaction and subscription references needed to reconcile purchases, but it does not store raw full card numbers.'
      },
      {
        heading: 'Optional advertising scripts',
        body: 'Google advertising scripts load only after the site records accepted cookie consent. Use the site privacy controls to review or change that choice.'
      },
      {
        heading: 'Questions about your data',
        body: 'Use the contact page for privacy questions or requests. FO Studio will evaluate any request against the records it must retain and the law that applies.'
      }
    ]
  },
  {
    id: 'terms',
    title: 'Studio and account terms',
    intro: 'These are the current operational terms for using the public site, account, membership checkout, and studio booking tools. The plan summary and booking preview shown immediately before confirmation are part of the transaction context.',
    blocks: [
      {
        heading: 'Account responsibility',
        body: 'Provide accurate contact information, protect your login, and use your account only for legitimate studio activity. You are responsible for bookings, plan selections, and other actions submitted through your account.'
      },
      {
        heading: 'Guest and member booking',
        body: 'Guest sessions require an account and follow the live guest window, hours, minimum duration, and checkout quote. Member sessions follow the active tier, available credit balance, booking window, peak rate, hold rules, and current waiver requirements.'
      },
      {
        heading: 'Membership billing and changes',
        body: 'The checkout page shows the billing cadence, cycle charge, effective monthly amount when applicable, and credit release schedule before payment. Managed Square plan changes and cancellations are scheduled for the next billing-cycle boundary rather than prorated mid-cycle.'
      },
      {
        heading: 'Studio use and equipment',
        body: 'Follow the current waiver, posted studio rules, access instructions, and booking limits. The equipment page describes the existing in-house inventory, but production-critical items should be confirmed before booking because gear may be serviced or replaced.'
      },
      {
        heading: 'Referral and workshop features',
        body: 'Referral rewards are evaluated only on an eligible first membership activation under the live rule. Workshop-hosting mode requires an active membership on an account that staff has enabled; a public workshop listing does not grant workshop-hosting access.'
      }
    ]
  },
  {
    id: 'cancellations',
    title: 'Cancellations and changes',
    intro: `The dashboard and booking server make the final eligibility decision from the current booking state. The current standard member modification window is ${memberNoticeHours.value} hours before the booking starts.`,
    blocks: [
      {
        heading: 'Standard bookings',
        body: `Request a cancellation or reschedule as early as possible. Standard member rescheduling is currently available until ${memberNoticeHours.value} hours before start. At submission, the server rechecks ownership, status, start time, and the applicable lock before making a change.`
      },
      {
        heading: 'Credits versus card refunds',
        body: 'When the cancellation server reports an eligible credit return, burned booking credits are returned to the account. A completed guest checkout should not be assumed to produce a refund to the original card; contact the studio if the account credit outcome does not address the situation.'
      },
      {
        heading: 'Standby bookings',
        body: 'A purchased standby booking cannot be canceled, rescheduled, extended, or chained into another standby booking. The booking preview identifies standby before confirmation.'
      },
      {
        heading: 'Pending payment reservations',
        body: 'An authenticated user can release a still-pending payment reservation if the server continues to report it as cancelable. Expired pending reservations are also removed by calendar maintenance.'
      },
      {
        heading: 'Membership cancellation',
        body: 'For a managed Square membership, cancellation is scheduled for the end of the current paid billing cycle and access remains active through that effective date. Admin-assigned or otherwise unmanaged memberships require direct studio support.'
      },
      {
        heading: 'Started sessions and no-shows',
        body: 'A booking cannot be canceled through the member flow after it starts. Time held for a session is treated as consumed when the booking is not canceled within the allowed flow.'
      }
    ]
  }
])

usePublicSeo(() => ({
  title: 'FO Studio Policies | Privacy, Terms & Cancellations',
  description: 'Read the current FO Studio privacy notice, account and membership terms, and operational cancellation rules.',
  canonicalPath: '/policies',
  image: '/images/main-banner.webp',
  schemaType: 'WebPage',
  keywords: ['FO Studio policies', 'studio cancellation policy', 'membership terms']
}))
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <header class="policies-panel-grid p-5 sm:p-6">
      <p class="policies-kicker">
        Policy center
      </p>
      <h1 class="policies-title">
        Privacy, terms, and cancellation rules in one place.
      </h1>
      <p class="policies-intro max-w-4xl">
        Use the direct section links below when reviewing signup, membership checkout, or a booking change. Live plan cards and booking previews remain authoritative for price, availability, and account-specific eligibility.
      </p>

      <nav
        class="mt-6 flex flex-wrap gap-2"
        aria-label="Policy sections"
      >
        <NuxtLink
          v-for="section in policySections"
          :key="section.id"
          :to="`#${section.id}`"
          class="rounded-full bg-[color:var(--gruv-bg-1)] px-4 py-2 text-sm font-semibold text-[color:var(--gruv-ink-1)] underline-offset-4 hover:underline"
        >
          {{ section.title }}
        </NuxtLink>
      </nav>
    </header>

    <div class="mt-8 space-y-8">
      <section
        v-for="section in policySections"
        :id="section.id"
        :key="section.id"
        class="policies-panel-grid scroll-mt-28 p-5 sm:p-6"
        data-reveal
      >
        <div class="max-w-4xl">
          <p class="policies-kicker">
            Policy / {{ section.id }}
          </p>
          <h2 class="policies-title">
            {{ section.title }}
          </h2>
          <p class="policies-intro">
            {{ section.intro }}
          </p>
        </div>

        <div class="mt-8 grid gap-4 lg:grid-cols-2">
          <article
            v-for="block in section.blocks"
            :key="block.heading"
            class="policies-block p-5"
          >
            <h3 class="policies-block-title">
              {{ block.heading }}
            </h3>
            <p class="policies-block-body">
              {{ block.body }}
            </p>
          </article>
        </div>
      </section>
    </div>
  </UContainer>
</template>
