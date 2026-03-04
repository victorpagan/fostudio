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

const openWaitlist = ref(false)

const creativeReasons = [
  {
    title: 'Work-ready access',
    body: 'Book with enough lead time to pitch clients, prep a set, and show up without wondering whether the room will still be available.'
  },
  {
    title: 'A studio that stays predictable',
    body: 'Credits, booking windows, and member caps keep the schedule calm. You can actually plan production weeks instead of chasing openings.'
  },
  {
    title: 'Built around real shooting days',
    body: 'Portrait sessions, product tables, video tests, client reviews, and repeat setups all fit better when the workflow is simple.'
  }
]

const process = [
  {
    title: 'Choose your rhythm',
    body: 'Pick the membership that matches how often you shoot, how far ahead you need to book, and how much flexibility your client work demands.'
  },
  {
    title: 'Use credits month by month',
    body: 'Your plan releases credits monthly, even on quarterly and annual billing, so your usage feels steady and easy to track.'
  },
  {
    title: 'Book with confidence',
    body: 'Check the calendar, reserve the time you need, and get on with styling, lighting, and client prep.'
  }
]

const featuredTiers: TierPreview[] = [
  {
    id: 'creator',
    name: 'Creator',
    monthly: '$350',
    cadenceNote: 'Best for steady personal work',
    headline: 'Portfolio building without the scramble',
    summary: 'Ideal for photographers and filmmakers who need dependable room to test, practice, and build stronger work on a real set.',
    details: ['Great for off-peak shoots', 'Comfortable room for solo or paired sessions', 'A smart base plan for building consistency']
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: '$650',
    cadenceNote: 'The core working plan',
    headline: 'Client-ready access for regular bookings',
    summary: 'Designed for freelancers and repeat client work when you need better booking reach and enough volume to keep production moving.',
    details: ['More room to plan weekday work', 'A better fit for repeat client bookings', 'Balanced for high-utility monthly use']
  },
  {
    id: 'studio_plus',
    name: 'Studio+',
    monthly: '$950',
    cadenceNote: 'Priority for heavier production',
    headline: 'For busy schedules and more demanding sets',
    summary: 'Built for creative teams, production-heavy months, and the kind of workflow that needs first crack at the calendar.',
    details: ['Longest booking horizon', 'Works well for small teams', 'The best fit for recurring production days']
  }
]

const studioNotes = [
  'A clean, controlled room that photographs well and stays easy to light.',
  'Membership-first scheduling so your work does not depend on last-minute luck.',
  'Equipment-friendly workflow that keeps setup and teardown more manageable.',
  'Optional guest booking when you need a one-off session before committing.'
]
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
                  A studio that moves at the pace of working creatives.
                </h1>
                <p class="max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
                  FO Studio is built for photographers, videographers, art directors, and creative teams who need a dependable room to make work.
                  Clear pricing, a readable calendar, and a smoother path from planning the set to delivering the shoot.
                </p>
              </div>

              <div class="flex flex-wrap gap-3">
                <UButton
                  to="/memberships"
                  size="xl"
                >
                  Find your membership
                </UButton>
                <UButton
                  color="neutral"
                  variant="soft"
                  size="xl"
                  to="/calendar"
                >
                  Check the calendar
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
                  color="neutral"
                  variant="soft"
                >
                  Membership-first schedule
                </UBadge>
                <UBadge
                  color="neutral"
                  variant="soft"
                >
                  Built for photo + video workflows
                </UBadge>
                <UBadge
                  color="neutral"
                  variant="soft"
                >
                  Guest booking available
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
                  When the room, the schedule, and the cost structure are easy to read, the creative work gets a lot easier to protect.
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
              Built to feel clear before the shoot day arrives.
            </h2>
            <p class="mt-3 text-base leading-8 text-[color:var(--gruv-ink-2)]">
              The system is simple on purpose. Pick a plan, use monthly credits, and reserve your time with enough margin to make your work better.
            </p>
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
              Choose the plan that matches the way you actually produce.
            </h2>
            <p class="mt-3 text-base leading-8 text-[color:var(--gruv-ink-2)]">
              Every plan is structured around monthly credit flow and booking access, so the real question is not which tier sounds bigger.
              It is which one keeps your production rhythm steady.
            </p>
          </div>

          <UButton to="/memberships">
            Compare all plans
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
                  monthly value
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
                Build a better shooting rhythm.
              </h2>
              <p class="mt-4 max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)]">
                Start with the membership that fits your current pace. If your workload changes, the structure is flexible enough to grow with it.
              </p>
            </div>

            <div class="flex flex-col gap-3">
              <UButton
                size="xl"
                to="/memberships"
              >
                Choose a membership
              </UButton>
              <UButton
                size="xl"
                color="neutral"
                variant="soft"
                to="/calendar"
              >
                See upcoming availability
              </UButton>
            </div>
          </div>
        </div>
      </UContainer>
    </section>
  </div>
</template>
