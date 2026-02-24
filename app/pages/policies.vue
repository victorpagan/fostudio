<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const tabs = ref<'privacy' | 'terms' | 'cancellation'>('privacy')
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
    <UContainer class="py-20">
      <div class="text-center">
        <h1 class="text-4xl font-bold tracking-tight">Policies</h1>
        <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Our terms, privacy policy, and cancellation policies
        </p>
      </div>

      <div class="mx-auto mt-16 max-w-3xl">
        <UTabs v-model="tabs" :items="[
          { key: 'privacy', label: 'Privacy Policy' },
          { key: 'terms', label: 'Terms of Service' },
          { key: 'cancellation', label: 'Cancellation Policy' }
        ]">
          <template #default="{ item }">
            <div class="space-y-6 py-6">
              <!-- Privacy Policy -->
              <div v-if="item.key === 'privacy'" class="prose dark:prose-invert max-w-none">
                <h2>Privacy Policy</h2>
                <p>
                  FO Studio ("we" or "us" or "our") operates the fostudio.com website (the "Service").
                </p>
                <h3>Information Collection and Use</h3>
                <p>
                  We collect personal information when you create an account, make a booking, or contact us. This includes:
                  names, email addresses, phone numbers, and payment information.
                </p>
                <h3>Data Security</h3>
                <p>
                  We use industry-standard SSL encryption to protect your personal information during transmission.
                </p>
                <h3>Changes to This Privacy Policy</h3>
                <p>
                  We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new
                  Privacy Policy on this page.
                </p>
              </div>

              <!-- Terms of Service -->
              <div v-else-if="item.key === 'terms'" class="prose dark:prose-invert max-w-none">
                <h2>Terms of Service</h2>
                <p>
                  By accessing and using FO Studio, you accept and agree to be bound by the terms and provision of this agreement.
                </p>
                <h3>Use License</h3>
                <p>
                  Permission is granted to temporarily download one copy of the materials (information or software) on FO Studio's
                  website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer
                  of title, and under this license you may not:
                </p>
                <ul>
                  <li>Modifying or copying the materials</li>
                  <li>Using the materials for any commercial purpose or for any public display</li>
                  <li>Attempting to decompile or reverse engineer any software contained on the website</li>
                  <li>Removing any copyright or other proprietary notations from the materials</li>
                </ul>
                <h3>Disclaimer</h3>
                <p>
                  The materials on FO Studio's website are provided on an 'as is' basis. FO Studio makes no warranties,
                  expressed or implied, and hereby disclaims and negates all other warranties.
                </p>
              </div>

              <!-- Cancellation Policy -->
              <div v-else-if="item.key === 'cancellation'" class="prose dark:prose-invert max-w-none">
                <h2>Cancellation Policy</h2>
                <h3>For Members</h3>
                <p>
                  Members can cancel bookings up to 24 hours before the scheduled time for a full credit refund.
                  Cancellations within 24 hours will forfeit the credits.
                </p>
                <h3>For Guest Bookings</h3>
                <p>
                  Guests can cancel up to 24 hours before the scheduled time for a full refund to the original payment method.
                  Cancellations within 24 hours are non-refundable.
                </p>
                <h3>Membership Cancellation</h3>
                <p>
                  You can cancel your membership at any time. Your membership will remain active through the end of your current
                  billing period. No refunds will be issued for partial months.
                </p>
                <h3>No-Show Policy</h3>
                <p>
                  If you do not show up for your booking, it will be marked as a no-show and your credits/payment will not be refunded.
                </p>
              </div>
            </div>
          </template>
        </UTabs>
      </div>
    </UContainer>
  </div>
</template>
