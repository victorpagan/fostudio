<!-- File: pages/index.vue -->
<script setup lang="ts">
type Cta = { label: string; to: string }
type LandingContent = {
  hero?: {
    headline?: string
    subheadline?: string
    primaryCta?: Cta
    secondaryCta?: Cta
    chips?: string[]
    media?: { type?: 'image' | 'grid'; images?: { src: string; alt?: string }[] }
  }
  howItWorks?: { title?: string; steps?: { title: string; body: string }[] }
  membershipsPreview?: { title?: string; subtitle?: string; cta?: Cta }
  valueProps?: { title?: string; bullets?: string[]; cta?: Cta }
  fairness?: { title?: string; body?: string; bullets?: string[] }
  faq?: { title?: string }
  finalCta?: { title?: string; body?: string; primaryCta?: Cta; secondaryCta?: Cta }
}

type MembershipTierPreview = {
  id: string
  name: string
  price: number
  credits: number
  bookingWindowDays: number
  tagline?: string
  bestFor?: string[]
  cap?: number
  spotsLeft?: number | null // null = unknown (can wire later)
}

const { data: landing } = await useAsyncData('landing', async () => {
  // content/site/landing.yml
  return (await queryContent<LandingContent>('site/landing').findOne()) ?? {}
})

const { data: memberships } = await useAsyncData('membershipsPreview', async () => {
  // content/site/memberships.yml
  const doc = await queryContent<{ tiers: MembershipTierPreview[] }>('site/memberships').findOne()
  return doc?.tiers ?? []
})

// For v1 you can hardcode “spots left” in content, or leave null.
// Later: fetch from your DB and replace this computed map.
const tiers = computed(() =>
  (memberships.value ?? []).map((t) => ({
    ...t,
    // If you want to start with the caps you mentioned:
    cap: t.cap ?? (t.id === 'creator' ? 10 : t.id === 'pro' ? 5 : 3),
  })),
)

const faqItems = computed(() => {
  // content/site/faq.yml (optional). If you prefer to keep FAQ in landing.yml, remove this block.
  // We'll try to load it dynamically with <ContentQuery> in the template instead for simplicity.
  return []
})

const hero = computed(() => landing.value?.hero ?? {})
const howItWorks = computed(() => landing.value?.howItWorks ?? {})
const membershipsPreview = computed(() => landing.value?.membershipsPreview ?? {})
const valueProps = computed(() => landing.value?.valueProps ?? {})
const fairness = computed(() => landing.value?.fairness ?? {})
const finalCta = computed(() => landing.value?.finalCta ?? {})

const openWaitlist = ref(false)
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="py-10 sm:py-14">
      <UContainer>
        <div class="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h1 class="text-3xl font-semibold tracking-tight sm:text-5xl">
              {{ hero.headline ?? 'A studio you can rely on — when you need it.' }}
            </h1>
            <p class="mt-4 text-base leading-relaxed text-gray-600 dark:text-gray-300 sm:text-lg">
              {{ hero.subheadline ?? 'Membership-based photo studio rentals with included equipment, priority booking, and credit-based access.' }}
            </p>

            <div class="mt-6 flex flex-wrap gap-2">
              <UButton :to="hero.primaryCta?.to ?? '/calendar'">
                {{ hero.primaryCta?.label ?? 'See Availability' }}
              </UButton>
              <UButton color="neutral" variant="soft" :to="hero.secondaryCta?.to ?? '/memberships'">
                {{ hero.secondaryCta?.label ?? 'Explore Memberships' }}
              </UButton>

              <!-- Waitlist modal -->
              <UModal v-model:open="openWaitlist">
                <UButton color="neutral" variant="ghost" @click="openWaitlist = true">
                  Join waitlist
                </UButton>

                <template #content>
                  <UCard>
                    <template #header>
                      <div class="flex items-center justify-between">
                        <div class="font-semibold">Join the waitlist</div>
                        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="openWaitlist = false" />
                      </div>
                    </template>

                    <p class="text-sm text-gray-600 dark:text-gray-300">
                      We cap memberships to protect availability. Leave your info and we’ll notify you when a spot opens.
                    </p>

                    <div class="mt-4 grid gap-3">
                      <UInput placeholder="Email" />
                      <UInput placeholder="Phone (optional)" />
                      <USelect
                        :options="[
                { label: 'Creator', value: 'creator' },
                { label: 'Pro', value: 'pro' },
                { label: 'Studio+', value: 'studio_plus' }
              ]"
                        placeholder="Desired tier"
                      />
                    </div>

                    <template #footer>
                      <div class="flex justify-end gap-2">
                        <UButton color="neutral" variant="soft" @click="openWaitlist = false">Cancel</UButton>
                        <UButton @click="openWaitlist = false">Submit</UButton>
                      </div>
                    </template>
                  </UCard>
                </template>
              </UModal>

            </div>

            <div class="mt-6 flex flex-wrap gap-2">
              <UBadge
                v-for="(chip, i) in (hero.chips ?? ['Members-first availability', 'Equipment included', 'Priority booking windows'])"
                :key="i"
                color="neutral"
                variant="soft"
              >
                {{ chip }}
              </UBadge>
            </div>

            <!-- Optional dynamic widget placeholder -->
            <div class="mt-8">
              <UCard>
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div class="text-sm font-medium">Next availability</div>
                    <div class="text-sm text-gray-600 dark:text-gray-300">
                      Coming soon (wire to bookings table)
                    </div>
                  </div>
                  <UButton size="sm" color="gray" variant="soft" to="/calendar">Open calendar</UButton>
                </div>
              </UCard>
            </div>
          </div>

          <!-- Media -->
          <div>
            <div class="grid grid-cols-2 gap-3 sm:gap-4">
              <div class="col-span-2 overflow-hidden rounded-2xl border border-gray-200/60 dark:border-gray-800/60">
                <img
                  :src="hero.media?.images?.[0]?.src ?? '/images/studio-hero-1.jpg'"
                  :alt="hero.media?.images?.[0]?.alt ?? 'Studio preview'"
                  class="h-64 w-full object-cover sm:h-80"
                />
              </div>
              <div class="overflow-hidden rounded-2xl border border-gray-200/60 dark:border-gray-800/60">
                <img
                  :src="hero.media?.images?.[1]?.src ?? '/images/studio-hero-2.jpg'"
                  :alt="hero.media?.images?.[1]?.alt ?? 'Studio preview 2'"
                  class="h-40 w-full object-cover sm:h-48"
                />
              </div>
              <div class="overflow-hidden rounded-2xl border border-gray-200/60 dark:border-gray-800/60">
                <img
                  :src="hero.media?.images?.[2]?.src ?? '/images/studio-hero-3.jpg'"
                  :alt="hero.media?.images?.[2]?.alt ?? 'Studio preview 3'"
                  class="h-40 w-full object-cover sm:h-48"
                />
              </div>
            </div>

            <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Tip: drop your real images into <code>/public/images</code> and update <code>content/site/landing.yml</code>.
            </p>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- How it works -->
    <section class="py-12 sm:py-16 border-t border-gray-200/60 dark:border-gray-800/60">
      <UContainer>
        <div class="flex items-end justify-between gap-6">
          <div>
            <h2 class="text-2xl font-semibold tracking-tight">
              {{ howItWorks.title ?? 'How it works' }}
            </h2>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Simple, predictable access — designed to protect availability.
            </p>
          </div>
          <UButton color="neutral" variant="soft" to="/memberships" class="hidden sm:inline-flex">
            See plans
          </UButton>
        </div>

        <div class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <UCard v-for="(step, i) in (howItWorks.steps ?? [])" :key="i" class="h-full">
            <div class="flex items-center gap-2">
              <UBadge color="neutral" variant="soft">{{ i + 1 }}</UBadge>
              <div class="font-medium">{{ step.title }}</div>
            </div>
            <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">
              {{ step.body }}
            </p>
          </UCard>

          <!-- fallback if content empty -->
          <template v-if="!(howItWorks.steps?.length)">
            <UCard v-for="(step, i) in [
              { title: 'Pick a membership', body: 'Choose a tier based on how often you shoot.' },
              { title: 'Get monthly credits', body: 'Credits refresh monthly and can roll for a limited time.' },
              { title: 'Book with priority', body: 'Higher tiers book further ahead.' },
              { title: 'Shoot with included gear', body: 'Members can use studio equipment at no extra cost.' },
              { title: 'Add an overnight hold', body: 'Leave your setup overnight (limited availability).' }
            ]" :key="i">
              <div class="flex items-center gap-2">
                <UBadge color="neutral" variant="soft">{{ i + 1 }}</UBadge>
                <div class="font-medium">{{ step.title }}</div>
              </div>
              <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">{{ step.body }}</p>
            </UCard>
          </template>
        </div>
      </UContainer>
    </section>

    <!-- Membership preview -->
    <section id="memberships-preview" class="py-12 sm:py-16">
      <UContainer>
        <div class="flex items-end justify-between gap-6">
          <div>
            <h2 class="text-2xl font-semibold tracking-tight">
              {{ membershipsPreview.title ?? 'Memberships' }}
            </h2>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
              {{ membershipsPreview.subtitle ?? 'Choose your access level. Spots are limited to protect availability.' }}
            </p>
          </div>
          <UButton :to="membershipsPreview.cta?.to ?? '/memberships'">
            {{ membershipsPreview.cta?.label ?? 'Compare plans' }}
          </UButton>
        </div>

        <div class="mt-8 grid gap-4 lg:grid-cols-3">
          <UCard v-for="tier in tiers" :key="tier.id" class="relative">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="text-lg font-semibold">{{ tier.name }}</div>
                <div class="mt-1 text-sm text-gray-600 dark:text-gray-300">{{ tier.tagline }}</div>
              </div>
              <div class="text-right">
                <div class="text-xl font-semibold">${{ tier.price }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">per month</div>
              </div>
            </div>

            <div class="mt-5 grid grid-cols-3 gap-2">
              <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
                <div class="text-sm font-medium">{{ tier.credits }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">credits</div>
              </div>
              <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
                <div class="text-sm font-medium">{{ tier.bookingWindowDays }}d</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">booking</div>
              </div>
              <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
                <div class="text-sm font-medium">{{ tier.cap }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">spots</div>
              </div>
            </div>

            <ul class="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <li v-for="(b, i) in (tier.bestFor ?? [])" :key="i" class="flex gap-2">
                <span class="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                <span>{{ b }}</span>
              </li>
            </ul>

            <div class="mt-6 flex items-center justify-between">
              <UBadge color="neutral" variant="soft">
                Limited spots
              </UBadge>
              <UButton size="sm" color="neutral" variant="soft" to="/memberships">
                Details
              </UButton>
            </div>
          </UCard>
        </div>
      </UContainer>
    </section>

    <!-- Value props -->
    <section class="py-12 sm:py-16 border-t border-gray-200/60 dark:border-gray-800/60">
      <UContainer>
        <div class="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 class="text-2xl font-semibold tracking-tight">
              {{ valueProps.title ?? 'What you get' }}
            </h2>
            <ul class="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <li v-for="(b, i) in (valueProps.bullets ?? [
                'Professional lighting and modifiers',
                'Backdrops and grip',
                'Clean, controlled environment',
                'Equipment included for members',
                'Optional overnight equipment holds'
              ])" :key="i" class="flex gap-2">
                <span class="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                <span>{{ b }}</span>
              </li>
            </ul>
            <div class="mt-6">
              <UButton color="neutral" variant="soft" :to="valueProps.cta?.to ?? '/equipment'">
                {{ valueProps.cta?.label ?? 'See equipment' }}
              </UButton>
            </div>
          </div>

          <UCard>
            <div class="text-sm font-medium">Featured</div>
            <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Add a small gallery, studio amenities, parking/loading notes, etc. Keep this editable via content later.
            </p>
            <div class="mt-4 grid grid-cols-3 gap-2">
              <div class="h-20 rounded-xl bg-gray-100 dark:bg-gray-900" />
              <div class="h-20 rounded-xl bg-gray-100 dark:bg-gray-900" />
              <div class="h-20 rounded-xl bg-gray-100 dark:bg-gray-900" />
            </div>
          </UCard>
        </div>
      </UContainer>
    </section>

    <!-- Fairness / peak credits explainer -->
    <section class="py-12 sm:py-16">
      <UContainer>
        <UCard>
          <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div class="text-lg font-semibold">
                {{ fairness.title ?? 'Peak time stays fair' }}
              </div>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {{ fairness.body ?? 'Peak hours use more credits. This protects availability for working photographers and keeps scheduling predictable.' }}
              </p>
              <ul class="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li v-for="(b, i) in (fairness.bullets ?? [
                  'Higher tiers book further ahead',
                  'Top-offs available for busy months',
                  'Overnight holds are limited and optional'
                ])" :key="i" class="flex gap-2">
                  <span class="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                  <span>{{ b }}</span>
                </li>
              </ul>
            </div>
            <div class="flex gap-2">
              <UButton to="/calendar">View calendar</UButton>
              <UButton color="neutral" variant="soft" to="/memberships">Plans</UButton>
            </div>
          </div>
        </UCard>
      </UContainer>
    </section>

    <!-- FAQ (Nuxt Content driven) -->
    <!--
<section class="py-12 sm:py-16 border-t border-gray-200/60 dark:border-gray-800/60">
<UContainer>
  <h2 class="text-2xl font-semibold tracking-tight">
    {{ landing?.faq?.title ?? 'FAQ' }}
  </h2>

  <div class="mt-6">
    <content-query path="/site/faq" find="one" v-slot="{ data }">
      <UAccordion
        :items="(data?.items ?? []).map((it: any) => ({ label: it.q, content: it.a }))"
        multiple
      />
    </content-query>
        </div>
      </UContainer>
    </section>
    -->

    <!-- Final CTA -->
    <section class="py-12 sm:py-16">
      <UContainer>
        <UCard>
          <div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div class="text-lg font-semibold">
                {{ finalCta.title ?? 'Ready to shoot?' }}
              </div>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {{ finalCta.body ?? 'Check availability or choose a membership tier. Spots are limited to protect access.' }}
              </p>
            </div>
            <div class="flex gap-2">
              <UButton :to="finalCta.primaryCta?.to ?? '/calendar'">
                {{ finalCta.primaryCta?.label ?? 'See Availability' }}
              </UButton>
              <UButton color="neutral" variant="soft" :to="finalCta.secondaryCta?.to ?? '/memberships'">
                {{ finalCta.secondaryCta?.label ?? 'Explore Memberships' }}
              </UButton>
            </div>
          </div>
        </UCard>
      </UContainer>
    </section>
  </div>
</template>
