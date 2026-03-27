<script setup lang="ts">
import { z } from 'zod'

definePageMeta({
  layout: 'default'
})

type ContactField = 'name' | 'email' | 'phone' | 'subject' | 'message' | 'company'
type FieldErrors = Record<ContactField, string>

type SiteContactContent = {
  hero: {
    kicker: string
    title: string
    description: string
  }
  reasonsPanel: {
    title: string
    items: string[]
  }
  detailsPanel: {
    title: string
    intro: string
  }
  mapPanel: {
    title: string
    description: string
  }
  followupPanel: {
    title: string
    body: string
  }
  formPanel: {
    title: string
    description: string
    submittedTitle: string
    submittedBody: string
    submitLabel: string
  }
}

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.'),
  email: z.string().trim().email('Please enter a valid email address.'),
  phone: z.string().trim().optional(),
  subject: z.string().trim().min(5, 'Please add a short subject line.'),
  message: z.string().trim().min(10, 'Please share a little more detail.'),
  company: z.string().trim().optional()
})

const fallbackContent: SiteContactContent = {
  hero: {
    kicker: 'Contact',
    title: 'Reach out before the next shoot comes together.',
    description: 'Use this page for membership questions, booking help, studio fit checks, or anything else that helps you decide whether FO Studio matches the way you work.'
  },
  reasonsPanel: {
    title: 'Best reasons to reach out',
    items: [
      'You are comparing memberships and want a quick recommendation.',
      'You have a client date in mind and want to confirm the booking path.',
      'You need to clarify equipment, access, or whether the room fits your production.'
    ]
  },
  detailsPanel: {
    title: 'Studio details',
    intro: ''
  },
  mapPanel: {
    title: 'Find the studio',
    description: 'Use the map for quick routing, parking planning, and client arrival coordination.'
  },
  followupPanel: {
    title: 'What happens after you send',
    body: 'Messages go to the studio inbox through the server-side contact endpoint. The reply will come back to the email you enter below, so use the address you actually want us to answer.'
  },
  formPanel: {
    title: 'Send a message',
    description: 'Share what you are planning, what you need help with, and how best to reach you back.',
    submittedTitle: 'Message sent',
    submittedBody: 'Your note is in the queue. We will reply to the email you provided as soon as we can.',
    submitLabel: 'Send message'
  }
}

const config = useRuntimeConfig()
const toast = useToast()
const { data: siteContact } = await useAsyncData('site:contact', async () => {
  return await queryCollection('siteContact').first()
})
const pageContent = computed<SiteContactContent>(() => {
  return (siteContact.value as SiteContactContent | null) ?? fallbackContent
})
const mapQuery = 'LA Film Lab, 3131 N. San Fernando Rd., Los Angeles, CA 90065'
const mapEmbedUrl = computed(() => `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&t=&z=15&ie=UTF8&iwloc=&output=embed`)
const mapDirectionsUrl = computed(() => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`)

const state = reactive({
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
  company: ''
})

const fieldErrors = reactive<FieldErrors>({
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
  company: ''
})
const isLoading = ref(false)
const submitted = ref(false)

const contactDetails = computed(() => [
  {
    label: 'Email',
    value: config.public.contactEmail,
    detail: 'The fastest way to reach the LA Film Lab studio team.'
  },
  {
    label: 'Phone',
    value: config.public.contactPhone || 'Add a phone line when you are ready.',
    detail: 'Useful for shoot-day coordination and quick schedule questions.'
  },
  {
    label: 'Location',
    value: config.public.contactLocation,
    detail: 'Share a clear public summary now, or keep the exact address private until booking.'
  }
])

function clearFieldErrors() {
  fieldErrors.name = ''
  fieldErrors.email = ''
  fieldErrors.phone = ''
  fieldErrors.subject = ''
  fieldErrors.message = ''
  fieldErrors.company = ''
}

function resetForm() {
  state.name = ''
  state.email = ''
  state.phone = ''
  state.subject = ''
  state.message = ''
  state.company = ''
  clearFieldErrors()
}

async function submitForm() {
  clearFieldErrors()

  const parsed = contactSchema.safeParse(state)
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors
    for (const [key, value] of Object.entries(flattened)) {
      const message = value?.[0]
      if (message) fieldErrors[key as ContactField] = message
    }

    toast.add({
      title: 'Please review the form',
      description: 'A few fields need attention before the message can be sent.',
      color: 'warning'
    })
    return
  }

  isLoading.value = true

  try {
    await $fetch('/api/contact', {
      method: 'POST',
      body: parsed.data
    })

    submitted.value = true
    resetForm()
  } catch (error: unknown) {
    const err = error as {
      data?: { statusMessage?: string }
      message?: string
    }

    toast.add({
      title: 'Message not sent',
      description: err.data?.statusMessage ?? err.message ?? 'Please try again in a moment.',
      color: 'error'
    })
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="space-y-8">
      <section class="contact-hero-frame">
        <div class="contact-hero-grid">
          <div class="contact-hero-main">
            <p class="editorial-label">
              Contact
            </p>
          </div>

          <div class="contact-side-panel">
            <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
              {{ pageContent.reasonsPanel.title }}
            </div>
            <div class="mt-4 space-y-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              <p
                v-for="reason in pageContent.reasonsPanel.items"
                :key="reason"
              >
                {{ reason }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div class="contact-main-grid">
        <div class="contact-main-left">
          <div class="contact-panel contact-panel--details">
            <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
              {{ pageContent.detailsPanel.title }}
            </div>
            <div class="mt-3 space-y-4">
              <div
                v-for="item in contactDetails"
                :key="item.label"
                class="contact-detail-item"
              >
                <div class="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--gruv-ink-2)]">
                  {{ item.label }}
                </div>
                <div class="mt-2 text-sm font-semibold text-[color:var(--gruv-ink-0)] sm:text-base">
                  {{ item.value }}
                </div>
                <p class="mt-2 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
                  {{ item.detail }}
                </p>
              </div>
            </div>
          </div>

          <div class="contact-panel contact-panel--map">
            <div class="overflow-hidden">
              <iframe
                :src="mapEmbedUrl"
                title="LA Film Lab map"
                class="h-72 w-full"
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
              />
            </div>
            <div class="px-2 pb-2 pt-4">
              <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
                {{ pageContent.mapPanel.title }}
              </div>
              <p class="mt-2 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
                {{ pageContent.mapPanel.description }}
              </p>
              <UButton
                class="mt-4"
                color="neutral"
                variant="soft"
                :to="mapDirectionsUrl"
                target="_blank"
              >
                Open in Google Maps
              </UButton>
            </div>
          </div>
        </div>

        <div class="contact-panel contact-panel--form">
          <div
            v-if="submitted"
            class="space-y-4 py-8 text-center"
          >
            <UIcon
              name="i-heroicons-check-circle"
              class="mx-auto h-12 w-12 text-success"
            />
            <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
              {{ pageContent.formPanel.submittedTitle }}
            </div>
            <p class="mx-auto max-w-xl text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              {{ pageContent.formPanel.submittedBody }}
            </p>
            <UButton
              color="neutral"
              variant="soft"
              @click="submitted = false"
            >
              Send another message
            </UButton>
          </div>

          <form
            v-else
            class="space-y-4"
            @submit.prevent="submitForm"
          >
            <div>
              <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
                {{ pageContent.formPanel.title }}
              </div>
              <p class="mt-2 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
                {{ pageContent.formPanel.description }}
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="Name"
                :error="fieldErrors.name"
              >
                <UInput
                  v-model="state.name"
                  placeholder="Your name"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Email"
                :error="fieldErrors.email"
              >
                <UInput
                  v-model="state.email"
                  type="email"
                  placeholder="you@example.com"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="Phone (optional)"
                :error="fieldErrors.phone"
              >
                <UInput
                  v-model="state.phone"
                  type="tel"
                  placeholder="(555) 000-0000"
                  class="w-full"
                />
              </UFormField>

              <UFormField
                label="Subject"
                :error="fieldErrors.subject"
              >
                <UInput
                  v-model="state.subject"
                  placeholder="What do you need help with?"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField
              label="Message"
              :error="fieldErrors.message"
            >
              <UTextarea
                v-model="state.message"
                placeholder="Tell us about the shoot, the timeline, or the question you are working through."
                :rows="6"
                class="w-full"
              />
            </UFormField>

            <div class="hidden">
              <UFormField
                label="Company"
                :error="fieldErrors.company"
              >
                <UInput
                  v-model="state.company"
                  autocomplete="off"
                  tabindex="-1"
                />
              </UFormField>
            </div>

            <UButton
              type="submit"
              :loading="isLoading"
              block
            >
              {{ pageContent.formPanel.submitLabel }}
            </UButton>
          </form>
        </div>
      </div>
    </div>
  </UContainer>
</template>
