<script setup lang="ts">
type Cadence = 'monthly' | 'quarterly' | 'annual'

type PlanOption = {
  cadence: Cadence
  provider_plan_variation_id: string | null
  credits_per_month: number
  price_cents: number
  currency: string
  discount_label?: string | null
}

type Tier = {
  id: string
  display_name: string
  description?: string | null
  booking_window_days: number
  peak_multiplier: number
  max_bank: number
  holds_included: number
  adminOnly?: boolean
  membership_plan_variations: PlanOption[]
}

const route = useRoute()
const router = useRouter()
const returnTo = computed(() => {
  const value = route.query.returnTo
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/dashboard'
})

const { user } = useCurrentUser()
const isAuthed = computed(() => !!user.value)

// Modal for unauthenticated users
const guestModalOpen = ref(false)
const pendingTierId = ref<string | null>(null)
const pendingCadence = ref<Cadence | null>(null)

const { data, refresh } = await useFetch<{ tiers: Tier[] }>('/api/membership/catalog', {
  default: () => ({ tiers: [] })
})

const tiers = computed(() => data.value?.tiers ?? [])

watch(() => user.value?.sub, async () => {
  await refresh()
})

onMounted(async () => {
  await refresh()
})

function formatMoney(cents: number, currency: string) {
  const dollars = (cents / 100).toFixed(0)
  return currency === 'USD' ? `$${dollars}` : `${dollars} ${currency}`
}

function cadenceLabel(c: Cadence) {
  if (c === 'monthly') return 'Monthly'
  if (c === 'quarterly') return 'Quarterly'
  return 'Annual'
}

function cadenceSupportText(c: Cadence) {
  if (c === 'monthly') return 'Billed month to month for the most flexible schedule.'
  if (c === 'quarterly') return 'Billed every three months while credits still release monthly.'
  return 'Billed once per year with the same steady monthly credit release.'
}

function cadencePriceWindow(c: Cadence) {
  if (c === 'monthly') return 'per month'
  if (c === 'quarterly') return 'per quarter'
  return 'per year'
}

function sortedOptions(tier: Tier) {
  const order: Record<Cadence, number> = { monthly: 0, quarterly: 1, annual: 2 }
  return [...tier.membership_plan_variations].sort((left, right) => order[left.cadence] - order[right.cadence])
}

function tierLead(tier: Tier) {
  const notes: Record<string, string> = {
    creator: 'A strong fit for personal work, portfolio building, test shoots, and slower-paced client growth.',
    pro: 'The dependable middle ground for working creatives who need regular room on the calendar.',
    studio_plus: 'The priority access plan for heavier production schedules, repeat clients, and team-led sessions.',
    test: 'Internal dry-run access for admin checkout testing.'
  }

  return notes[tier.id] ?? 'Flexible access built for real production schedules.'
}

function tierHighlights(tier: Tier) {
  const notes: Record<string, string[]> = {
    creator: ['Good for refining your craft', 'Comfortable for solo and small-team shoots'],
    pro: ['Made for recurring bookings', 'Better booking reach when client dates matter'],
    studio_plus: ['Best for packed calendars', 'Useful when your set days need priority'],
    test: ['Admin-only internal flow', 'No live charge required']
  }

  return notes[tier.id] ?? ['Membership-first scheduling', 'Built around repeat studio use']
}

function checkoutUrl(tierId: string, cadence: Cadence) {
  return `/checkout?tier=${encodeURIComponent(tierId)}&cadence=${encodeURIComponent(cadence)}&returnTo=${encodeURIComponent(returnTo.value)}`
}

function onSelectPlan(tierId: string, cadence: Cadence) {
  if (isAuthed.value) {
    router.push(checkoutUrl(tierId, cadence))
  } else {
    // Store the intended plan and show the sign-up prompt
    pendingTierId.value = tierId
    pendingCadence.value = cadence
    guestModalOpen.value = true
  }
}

function goSignup() {
  const dest = pendingTierId.value && pendingCadence.value
    ? checkoutUrl(pendingTierId.value, pendingCadence.value)
    : '/checkout'
  router.push(`/signup?returnTo=${encodeURIComponent(dest)}`)
}

function goLogin() {
  const dest = pendingTierId.value && pendingCadence.value
    ? checkoutUrl(pendingTierId.value, pendingCadence.value)
    : '/checkout'
  router.push(`/login?returnTo=${encodeURIComponent(dest)}`)
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <section class="studio-grid overflow-hidden rounded-[2rem] border border-[color:var(--gruv-line)] px-5 py-6 sm:px-8 sm:py-8">
      <div class="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-end">
        <div class="space-y-5">
          <span class="studio-kicker">Memberships</span>
          <div class="max-w-3xl space-y-4">
            <h1 class="studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-7xl">
              Pick the studio rhythm that fits the way you actually work.
            </h1>
            <p class="max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
              Every plan is built for working photographers, filmmakers, and creative teams who need dependable access,
              clearer pricing, and a booking window they can actually plan around.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UBadge
              color="neutral"
              variant="soft"
            >
              Credits release monthly
            </UBadge>
            <UBadge
              color="neutral"
              variant="soft"
            >
              Guest booking stays available
            </UBadge>
            <UBadge
              color="neutral"
              variant="soft"
            >
              Upgrade when your production load grows
            </UBadge>
          </div>
        </div>

        <div class="studio-panel p-5 sm:p-6">
          <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
            What changes with membership
          </div>
          <div class="mt-4 space-y-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
            <p>You get a defined booking window, monthly studio credits, and lower-friction scheduling for repeat work.</p>
            <p>Quarterly and annual billing do not dump credits all at once. They still land month by month, so your balance stays easier to read.</p>
            <p>Choose the plan that matches your real booking pace now, then scale up as the work asks for it.</p>
          </div>
        </div>
      </div>
    </section>

    <div class="mt-10 grid gap-5 xl:grid-cols-3">
      <article
        v-for="tier in tiers"
        :key="tier.id"
        class="studio-panel plan-card"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
                {{ tier.display_name }}
              </div>
              <UBadge
                v-if="tier.adminOnly"
                color="warning"
                variant="soft"
                size="xs"
                icon="i-lucide-flask-conical"
              >
                Admin only
              </UBadge>
            </div>
            <p
              v-if="tier.description"
              class="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--gruv-ink-2)]"
            >
              {{ tier.description }}
            </p>
          </div>
        </div>

        <p class="plan-lead">
          {{ tierLead(tier) }}
        </p>

        <div class="space-y-2 text-sm leading-7 text-[color:var(--gruv-ink-1)]">
          <div
            v-for="highlight in tierHighlights(tier)"
            :key="highlight"
            class="flex gap-3"
          >
            <span class="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--gruv-olive)]" />
            <span>{{ highlight }}</span>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div class="plan-stat text-center">
            <div class="text-lg font-semibold text-[color:var(--gruv-ink-0)]">
              {{ tier.booking_window_days }}d
            </div>
            <div class="text-xs uppercase tracking-[0.14em] text-[color:var(--gruv-ink-2)]">
              booking reach
            </div>
          </div>
          <div class="plan-stat text-center">
            <div class="text-lg font-semibold text-[color:var(--gruv-ink-0)]">
              {{ tier.peak_multiplier }}x
            </div>
            <div class="text-xs uppercase tracking-[0.14em] text-[color:var(--gruv-ink-2)]">
              peak burn
            </div>
          </div>
          <div class="plan-stat text-center">
            <div class="text-lg font-semibold text-[color:var(--gruv-ink-0)]">
              {{ tier.max_bank }}
            </div>
            <div class="text-xs uppercase tracking-[0.14em] text-[color:var(--gruv-ink-2)]">
              bank cap
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div class="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--gruv-ink-2)]">
            Choose billing cadence
          </div>

          <div
            v-for="opt in sortedOptions(tier)"
            :key="opt.cadence"
            class="plan-option"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 text-sm font-semibold text-[color:var(--gruv-ink-0)]">
                  <span>{{ cadenceLabel(opt.cadence) }}</span>
                  <UBadge
                    v-if="opt.discount_label"
                    color="neutral"
                    variant="soft"
                  >
                    {{ opt.discount_label }}
                  </UBadge>
                </div>
                <div class="mt-1 text-xs uppercase tracking-[0.14em] text-[color:var(--gruv-ink-2)]">
                  {{ opt.credits_per_month }} credits released each month
                </div>
              </div>

              <div class="shrink-0 text-right">
                <div class="text-xl font-semibold text-[color:var(--gruv-ink-0)]">
                  {{ formatMoney(opt.price_cents, opt.currency) }}
                </div>
                <div class="text-xs uppercase tracking-[0.14em] text-[color:var(--gruv-ink-2)]">
                  {{ cadencePriceWindow(opt.cadence) }}
                </div>
              </div>
            </div>

            <p class="plan-option-copy">
              {{ cadenceSupportText(opt.cadence) }}
            </p>
          </div>
        </div>

        <div class="grid gap-2">
          <UButton
            v-for="opt in sortedOptions(tier)"
            :key="opt.cadence + '-btn'"
            block
            @click="onSelectPlan(tier.id, opt.cadence)"
          >
            Choose {{ tier.display_name }} ({{ cadenceLabel(opt.cadence) }})
          </UButton>
        </div>

        <div class="rounded-2xl border border-[color:var(--gruv-line)] bg-[rgba(181,118,20,0.08)] px-4 py-3 text-xs leading-6 text-[color:var(--gruv-ink-2)]">
          Includes {{ tier.holds_included }} hold window{{ tier.holds_included === 1 ? '' : 's' }}.
          Peak-time bookings use {{ tier.peak_multiplier }}x credits when demand is highest.
        </div>
      </article>
    </div>

    <div class="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
      <div class="studio-panel p-5 sm:p-6">
        <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
          Not ready for a membership yet?
        </div>
        <p class="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--gruv-ink-2)]">
          You can still book as a guest for one-off shoots. Membership becomes the better fit once you want repeat access,
          a longer planning window, and a steadier cost structure.
        </p>
      </div>

      <div class="studio-panel p-5 sm:p-6">
        <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
          Need one date first?
        </div>
        <p class="mt-4 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
          Start with a guest session, then move into a membership when the work becomes recurring.
        </p>
        <UButton
          class="mt-5"
          color="neutral"
          variant="soft"
          to="/book"
          block
        >
          Book as a guest
        </UButton>
      </div>
    </div>

    <UModal v-model:open="guestModalOpen">
      <template #content>
        <UCard class="studio-panel">
          <template #header>
            <div class="flex items-center justify-between">
              <div>
                <p class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
                  Create an account to continue
                </p>
                <p class="mt-1 text-sm text-[color:var(--gruv-ink-2)]">
                  Memberships are tied to your account so your credits and bookings stay in one place.
                </p>
              </div>
              <UButton
                icon="i-heroicons-x-mark"
                color="neutral"
                variant="ghost"
                @click="guestModalOpen = false"
              />
            </div>
          </template>

          <div class="space-y-3">
            <p class="text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              It only takes a minute to set up. Once you are in, you can manage billing, track monthly credits,
              and move straight into checkout.
            </p>
            <p class="text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              Payment is handled securely through Square. FO Studio never stores your card details directly.
            </p>
          </div>

          <template #footer>
            <div class="flex flex-col gap-2 sm:flex-row">
              <UButton
                class="flex-1"
                @click="goSignup"
              >
                Create account &amp; continue
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                class="flex-1"
                @click="goLogin"
              >
                I already have an account
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </UContainer>
</template>
