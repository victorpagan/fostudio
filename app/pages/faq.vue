<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const faqs = [
  {
    question: 'What are the studio hours?',
    answer: 'Our studio is open Monday through Friday, 9 AM to 6 PM. Weekend hours are available by appointment.'
  },
  {
    question: 'Do I need to be a member to book?',
    answer: 'No, you can book as a guest for one-time sessions. Membership provides discounts and credits for regular users.'
  },
  {
    question: 'Can I cancel my booking?',
    answer: 'Yes, cancellations within 24 hours of your session receive a full credit refund. Cancellations within 24 hours are non-refundable.'
  },
  {
    question: 'What is included in each membership tier?',
    answer: 'Each tier provides different monthly credits, booking window, and premium features. View our memberships page for details.'
  },
  {
    question: 'How do credits work?',
    answer: 'Credits are used to book studio time. 1 credit equals 1 hour off-peak. Peak times (Mon-Thu 11 AM-4 PM) have a 2x multiplier.'
  },
  {
    question: 'Can I transfer my credits to someone else?',
    answer: 'Credits are tied to your account and cannot be transferred. However, you can book time for others if needed.'
  }
]

const openItem = ref<number | null>(null)
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
    <UContainer class="py-20">
      <div class="text-center">
        <h1 class="text-4xl font-bold tracking-tight">Frequently Asked Questions</h1>
        <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Find answers to common questions about our studio and services
        </p>
      </div>

      <div class="mx-auto mt-16 max-w-2xl space-y-4">
        <div
          v-for="(faq, i) in faqs"
          :key="i"
          class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
        >
          <button
            class="w-full px-6 py-4 text-left font-semibold transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
            @click="openItem = openItem === i ? null : i"
          >
            <div class="flex items-center justify-between">
              <span>{{ faq.question }}</span>
              <UIcon
                :name="openItem === i ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                class="h-5 w-5 transition-transform"
              />
            </div>
          </button>
          <div v-if="openItem === i" class="border-t border-gray-200 px-6 py-4 dark:border-gray-800">
            <p class="text-gray-600 dark:text-gray-400">{{ faq.answer }}</p>
          </div>
        </div>
      </div>
    </UContainer>
  </div>
</template>
