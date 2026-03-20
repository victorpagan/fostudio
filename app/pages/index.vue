<script setup lang="ts">
type TierPreview = {
  id: string
  name: string
  monthly: string
  cadenceNote: string
  headline: string
  summary: string
  details: string[]
}

type SiteLandingContent = {
  hero: {
    headline: string
    subheadline: string
    primaryCta: { label: string, to: string }
    secondaryCta: { label: string, to: string }
    chips: string[]
  }
  howItWorks: {
    title: string
    steps: Array<{ title: string, body: string }>
  }
  membershipsPreview: {
    title: string
    subtitle: string
    cta: { label: string, to: string }
  }
  valueProps: {
    title: string
    bullets: string[]
    cta: { label: string, to: string }
  }
  finalCta: {
    title: string
    body: string
    primaryCta: { label: string, to: string }
    secondaryCta: { label: string, to: string }
  }
}

const openWaitlist = ref(false)

const creativeReasons = [
  {
    title: '24/7 turnkey access',
    body: 'Book your slot, get your personalized access code, and set up or tear down whenever your production day actually needs it.'
  },
  {
    title: 'Built for real production',
    body: 'A 25x30 ft cyclorama, 20+ ft ceilings, and enough room for small to mid-size teams make this space practical for paid client work.'
  },
  {
    title: 'Fully equipped and ready',
    body: 'Profoto gear, backdrop paper, props, and day-to-day consumables are included with memberships so you can focus on the shoot, not logistics.'
  }
]

const fallbackProcess = [
  {
    title: 'Choose your plan',
    body: 'Start with the membership that matches your real volume now. You can upgrade or downgrade as your workload changes.'
  },
  {
    title: 'Pick a slot and pay',
    body: 'Choose your booking time, complete checkout, and confirm in minutes. Quarterly and annual discounts are available in the next step.'
  },
  {
    title: 'Show up prepared',
    body: 'Use your code, walk into a ready studio, and get to work with the space, gear, and consumables already in place.'
  }
]

const featuredTiers: TierPreview[] = [
  {
    id: 'creator',
    name: 'Creator',
    monthly: '$350',
    cadenceNote: 'Best for lighter monthly volume',
    headline: 'A strong start for weekend and off-peak shooters',
    summary: 'Great for occasional clients, test shoots, and creatives building consistent paid work without overcommitting.',
    details: ['Great value on evenings, weekends, and early mornings', 'Simple path for portfolio and test sessions', 'Includes full studio equipment and consumables']
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: '$650',
    cadenceNote: 'The core working plan',
    headline: 'Built for repeat client production',
    summary: 'A balanced plan for active photographers and production teams who need a dependable schedule and stronger booking reach.',
    details: ['Better planning for weekday client work', 'Priority improves compared with entry tiers', 'Includes equipment holds and useful add-ons']
  },
  {
    id: 'studio_plus',
    name: 'Studio+',
    monthly: '$950',
    cadenceNote: 'Priority for heavier production',
    headline: 'For busy calendars and larger set days',
    summary: 'Designed for high-output teams who need top booking priority, stronger hold options, and easier peak-hour access.',
    details: ['Best fit for larger teams (up to ~15)', 'Most flexible hold and priority access', 'Great for recurring commercial production']
  }
]

const fallbackStudioNotes = [
  '25x30 ft cyclorama with 20+ ft ceilings for production-ready framing and lighting.',
  'Small makeup station and client seating area for smoother on-set flow.',
  'Props, backdrops, Profoto equipment, and standard consumables are included with memberships.',
  'Film shooters get rush-fee waivers when the lab is open and capacity allows.'
]

const fallbackLanding: SiteLandingContent = {
  hero: {
    headline: 'A studio that moves at the pace of working creatives.',
    subheadline: 'LA Film Lab is a 24/7 turnkey studio for photographers, filmmakers, and creative teams. Book, pay, show up, and shoot in a space designed to stay production-ready.',
    primaryCta: { label: 'Find your membership', to: '/memberships' },
    secondaryCta: { label: 'Check the calendar', to: '/calendar' },
    chips: ['24/7 member access', '25x30 cyc · 20+ ft ceilings', 'Equipment + consumables included']
  },
  howItWorks: {
    title: 'Built to feel clear before the shoot day arrives.',
    steps: fallbackProcess
  },
  membershipsPreview: {
    title: 'Choose the plan that matches the way you actually produce.',
    subtitle: 'Keep the first decision simple: pick the membership that fits your immediate workload. Longer-term billing discounts and full cadence options are shown in the next step.',
    cta: { label: 'Compare all plans', to: '/memberships' }
  },
  valueProps: {
    title: 'Studio notes',
    bullets: fallbackStudioNotes,
    cta: { label: 'See equipment', to: '/equipment' }
  },
  finalCta: {
    title: 'Build a better shooting rhythm.',
    body: 'Start with the plan that fits your next 30 to 60 days. Upgrade or downgrade as your production pace shifts.',
    primaryCta: { label: 'Choose a membership', to: '/memberships' },
    secondaryCta: { label: 'See upcoming availability', to: '/calendar' }
  }
}

const { data: siteLanding } = await useAsyncData('site:landing', async () => {
  return await queryCollection('siteLanding').first()
})
const landingContent = computed<SiteLandingContent>(() => {
  return (siteLanding.value as SiteLandingContent | null) ?? fallbackLanding
})
const process = computed(() => landingContent.value.howItWorks.steps)
const studioNotes = computed(() => landingContent.value.valueProps.bullets)
</script>

<template>
  <div class="space-y-12 py-8 sm:space-y-16 sm:py-12">
    <section>
      <UContainer>
        <div class="studio-grid overflow-hidden rounded-[2rem] border border-[color:var(--gruv-line)] px-5 py-6 sm:px-8 sm:py-8">
          <div class="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-center">
            <div class="space-y-6">
              <span class="studio-kicker">Membership studio access</span>

              <div class="space-y-4">
                <h1 class="studio-display max-w-4xl text-6xl leading-[0.92] text-[color:var(--gruv-ink-0)] sm:text-8xl">
                  {{ landingContent.hero.headline }}
                </h1>
                <p class="max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
                  {{ landingContent.hero.subheadline }}
                </p>
              </div>

              <div class="flex flex-wrap gap-3">
                <UButton
                  :to="landingContent.hero.primaryCta.to"
                  size="xl"
                >
                  {{ landingContent.hero.primaryCta.label }}
                </UButton>
                <UButton
                  color="neutral"
                  variant="soft"
                  size="xl"
                  :to="landingContent.hero.secondaryCta.to"
                >
                  {{ landingContent.hero.secondaryCta.label }}
                </UButton>

                <UModal v-model:open="openWaitlist">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xl"
                    @click="openWaitlist = true"
                  >
                    Join the waitlist
                  </UButton>

                  <template #content>
                    <UCard class="studio-panel">
                      <template #header>
                        <div class="flex items-center justify-between gap-3">
                          <div>
                            <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
                              Join the waitlist
                            </div>
                            <p class="mt-1 text-sm text-[color:var(--gruv-ink-2)]">
                              We keep membership counts limited so booking stays usable.
                            </p>
                          </div>
                          <UButton
                            icon="i-heroicons-x-mark"
                            color="neutral"
                            variant="ghost"
                            @click="openWaitlist = false"
                          />
                        </div>
                      </template>

                      <div class="space-y-3">
                        <UInput placeholder="Email" />
                        <UInput placeholder="Phone (optional)" />
                        <USelect
                          :options="[
                            { label: 'Creator', value: 'creator' },
                            { label: 'Pro', value: 'pro' },
                            { label: 'Studio+', value: 'studio_plus' }
                          ]"
                          placeholder="Plan you are watching"
                        />
                      </div>

                      <template #footer>
                        <div class="flex justify-end gap-2">
                          <UButton
                            color="neutral"
                            variant="soft"
                            @click="openWaitlist = false"
                          >
                            Close
                          </UButton>
                          <UButton @click="openWaitlist = false">
                            Notify me
                          </UButton>
                        </div>
                      </template>
                    </UCard>
                  </template>
                </UModal>
              </div>

              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="chip in landingContent.hero.chips"
                  :key="chip"
                  color="neutral"
                  variant="soft"
                >
                  {{ chip }}
                </UBadge>
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="studio-panel p-5 sm:col-span-2">
                <div class="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--gruv-ink-2)]">
                  What the studio solves
                </div>
                <div class="mt-3 studio-display text-4xl text-[color:var(--gruv-ink-0)]">
                  Less time chasing space. More time shaping the work.
                </div>
                <p class="mt-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
                  We treat this as a community studio for professional shooters: dependable access, clear pricing, and real production support.
                </p>
              </div>

              <div
                v-for="reason in creativeReasons"
                :key="reason.title"
                class="studio-panel p-5"
              >
                <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
                  {{ reason.title }}
                </div>
                <p class="mt-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
                  {{ reason.body }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <section>
      <UContainer>
        <div class="grid gap-6 lg:grid-cols-3">
          <div
            v-for="note in studioNotes"
            :key="note"
            class="studio-panel p-5"
          >
            <div class="flex gap-3">
              <div class="mt-1 h-2 w-2 shrink-0 rounded-full bg-[color:var(--gruv-accent)]" />
              <p class="text-sm leading-7 text-[color:var(--gruv-ink-1)]">
                {{ note }}
              </p>
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <section>
      <UContainer>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="max-w-3xl">
            <span class="studio-kicker">How it works</span>
            <h2 class="mt-4 studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-6xl">
              {{ landingContent.howItWorks.title }}
            </h2>
          </div>

          <UButton
            color="neutral"
            variant="soft"
            to="/book"
          >
            Need one date first?
          </UButton>
        </div>

        <div class="mt-8 grid gap-4 lg:grid-cols-3">
          <UCard
            v-for="(step, index) in process"
            :key="step.title"
            class="studio-panel h-full"
          >
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(181,118,20,0.14)] text-sm font-semibold text-[color:var(--gruv-accent)]">
                {{ index + 1 }}
              </div>
              <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
                {{ step.title }}
              </div>
            </div>
            <p class="mt-4 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              {{ step.body }}
            </p>
          </UCard>
        </div>
      </UContainer>
    </section>

    <section>
      <UContainer>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="max-w-3xl">
            <span class="studio-kicker">Memberships</span>
            <h2 class="mt-4 studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-6xl">
              {{ landingContent.membershipsPreview.title }}
            </h2>
            <p class="mt-3 text-base leading-8 text-[color:var(--gruv-ink-2)]">
              {{ landingContent.membershipsPreview.subtitle }}
            </p>
          </div>

          <UButton :to="landingContent.membershipsPreview.cta.to">
            {{ landingContent.membershipsPreview.cta.label }}
          </UButton>
        </div>

        <div class="mt-8 grid gap-4 lg:grid-cols-3">
          <UCard
            v-for="tier in featuredTiers"
            :key="tier.id"
            class="studio-panel"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
                  {{ tier.name }}
                </div>
                <div class="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--gruv-ink-2)]">
                  {{ tier.cadenceNote }}
                </div>
              </div>

              <div class="text-right">
                <div class="text-2xl font-semibold text-[color:var(--gruv-ink-0)]">
                  {{ tier.monthly }}
                </div>
                <div class="text-xs uppercase tracking-[0.16em] text-[color:var(--gruv-ink-2)]">
                  starting monthly
                </div>
              </div>
            </div>

            <div class="mt-5 rounded-2xl border border-[color:var(--gruv-line)] bg-[rgba(181,118,20,0.08)] p-4">
              <div class="text-sm font-semibold text-[color:var(--gruv-accent)]">
                {{ tier.headline }}
              </div>
              <p class="mt-2 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
                {{ tier.summary }}
              </p>
            </div>

            <ul class="mt-5 space-y-2 text-sm leading-7 text-[color:var(--gruv-ink-1)]">
              <li
                v-for="detail in tier.details"
                :key="detail"
                class="flex gap-3"
              >
                <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--gruv-olive)]" />
                <span>{{ detail }}</span>
              </li>
            </ul>
          </UCard>
        </div>
      </UContainer>
    </section>

    <section>
      <UContainer>
        <div class="studio-panel px-5 py-6 sm:px-8 sm:py-8">
          <div class="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)] lg:items-center">
            <div>
              <span class="studio-kicker">Ready when you are</span>
              <h2 class="mt-4 studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-6xl">
                {{ landingContent.finalCta.title }}
              </h2>
              <p class="mt-4 max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)]">
                {{ landingContent.finalCta.body }}
              </p>
            </div>

            <div class="flex flex-col gap-3">
              <UButton
                size="xl"
                :to="landingContent.finalCta.primaryCta.to"
              >
                {{ landingContent.finalCta.primaryCta.label }}
              </UButton>
              <UButton
                size="xl"
                color="neutral"
                variant="soft"
                :to="landingContent.finalCta.secondaryCta.to"
              >
                {{ landingContent.finalCta.secondaryCta.label }}
              </UButton>
            </div>
          </div>
        </div>
      </UContainer>
    </section>
  </div>
</template>
