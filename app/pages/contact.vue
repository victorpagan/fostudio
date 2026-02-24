<script setup lang="ts">
import { z } from 'zod'

definePageMeta({
  layout: 'default'
})

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters')
})

type ContactForm = z.infer<typeof contactSchema>

const state = reactive({
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: ''
})

const isLoading = ref(false)
const submitted = ref(false)

async function submitForm() {
  try {
    isLoading.value = true
    const validated = contactSchema.parse(state)

    // TODO: Wire up actual form submission to a server endpoint
    console.log('Form submitted:', validated)

    submitted.value = true
    setTimeout(() => {
      submitted.value = false
      state.name = ''
      state.email = ''
      state.phone = ''
      state.subject = ''
      state.message = ''
    }, 3000)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation errors:', error.errors)
    }
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
    <UContainer class="py-20">
      <div class="text-center">
        <h1 class="text-4xl font-bold tracking-tight">Contact Us</h1>
        <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Get in touch with our team. We'd love to hear from you.
        </p>
      </div>

      <div class="mx-auto mt-16 grid max-w-4xl gap-8 md:grid-cols-2">
        <!-- Contact info -->
        <div class="space-y-8">
          <div>
            <h3 class="font-semibold">Location</h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              123 Studio Street<br>
              San Francisco, CA 94105
            </p>
          </div>
          <div>
            <h3 class="font-semibold">Contact Info</h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              Email: hello@fostudio.com<br>
              Phone: (415) 555-0123
            </p>
          </div>
          <div>
            <h3 class="font-semibold">Hours</h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              Monday - Friday: 9 AM - 6 PM<br>
              Saturday - Sunday: By Appointment
            </p>
          </div>
        </div>

        <!-- Contact form -->
        <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <form v-if="!submitted" class="space-y-4" @submit.prevent="submitForm">
            <UFormGroup label="Name">
              <UInput v-model="state.name" placeholder="Your name" />
            </UFormGroup>

            <UFormGroup label="Email">
              <UInput v-model="state.email" type="email" placeholder="your@email.com" />
            </UFormGroup>

            <UFormGroup label="Phone (optional)">
              <UInput v-model="state.phone" type="tel" placeholder="+1 (555) 000-0000" />
            </UFormGroup>

            <UFormGroup label="Subject">
              <UInput v-model="state.subject" placeholder="How can we help?" />
            </UFormGroup>

            <UFormGroup label="Message">
              <UTextarea v-model="state.message" placeholder="Your message..." rows="6" />
            </UFormGroup>

            <UButton type="submit" :loading="isLoading" class="w-full">
              Send Message
            </UButton>
          </form>

          <div v-else class="py-8 text-center">
            <UIcon name="i-heroicons-check-circle" class="mx-auto h-12 w-12 text-success" />
            <p class="mt-4 font-semibold">Thank you!</p>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              We've received your message and will get back to you soon.
            </p>
          </div>
        </div>
      </div>
    </UContainer>
  </div>
</template>
