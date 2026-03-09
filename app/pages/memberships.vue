<script setup lang="ts">
type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

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
const isPlanSwitchMode = computed(() => {
  const mode = route.query.mode
  return typeof mode === 'string' && mode.toLowerCase() === 'switch'
})

const { user } = useCurrentUser()

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

function sortedOptions(tier: Tier) {
  const order: Record<Cadence, number> = { daily: 0, weekly: 1, monthly: 2, quarterly: 3, annual: 4 }
  return [...tier.membership_plan_variations].sort((left, right) => order[left.cadence] - order[right.cadence])
}

function monthlyOption(tier: Tier) {
  const options = sortedOptions(tier)
  return options.find(option => option.cadence === 'monthly') ?? options[0] ?? null
}

function monthlyStartingLabel(tier: Tier) {
  const option = monthlyOption(tier)
  if (!option) return 'TBD'
  return formatMoney(option.price_cents, option.currency)
}

function formatPeakCredits(value: number) {
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function tierLead(tier: Tier) {
  const notes: Record<string, string> = {
    creator: 'Best for weekend warriors, newer client work, test shoots, and photographers growing a consistent booking rhythm.',
    pro: 'Built for active shooters who need regular client days, better weekday reach, and a cleaner repeat-booking flow.',
    studio_plus: 'For high-production teams that need priority access, peak-hour flexibility, and enough room for bigger set days.',
    test: 'Internal dry-run access for admin checkout testing.'
  }

  return notes[tier.id] ?? 'Flexible access built for real production schedules.'
}

function tierHighlights(tier: Tier) {
  const notes: Record<string, string[]> = {
    creator: ['Great access on evenings, early mornings, and weekends', 'Good fit for solo to small-team sessions'],
    pro: ['Better for recurring paid shoots and stronger planning windows', 'Useful when you need consistency without overbuying'],
    studio_plus: ['Best for heavier production months and larger teams (up to ~15)', 'Designed for smoother peak-hour scheduling and equipment holds'],
    test: ['Admin-only internal flow', 'No live charge required']
  }

  return notes[tier.id] ?? ['Membership-first scheduling', 'Built around repeat studio use']
}

function checkoutUrl(tierId: string) {
  const base = `/checkout?tier=${encodeURIComponent(tierId)}&returnTo=${encodeURIComponent(returnTo.value)}`
  return isPlanSwitchMode.value ? `${base}&mode=switch` : base
}

function onSelectTier(tierId: string) {
  router.push(checkoutUrl(tierId))
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <section class="studio-grid overflow-hidden rounded-[2rem] border border-[color:var(--gruv-line)] px-5 py-6 sm:px-8 sm:py-8">
      <div class="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-end">
        <div class="space-y-5">
          <span class="studio-kicker">Memberships</span>
          <UBadge
            v-if="isPlanSwitchMode"
            color="warning"
            variant="soft"
            class="w-fit"
          >
            Change mode: next billing cycle
          </UBadge>
          <div class="max-w-3xl space-y-4">
            <h1 class="studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-7xl">
              Pick the studio rhythm that fits the way you actually work.
            </h1>
            <p class="max-w-2xl text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
              This is a 24/7 turnkey studio built for photographers and small-to-mid crews. Book the plan that matches your volume,
              then use the space like it was made for production days, not paperwork.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UBadge
              color="neutral"
              variant="soft"
            >
              24/7 member access
            </UBadge>
            <UBadge
              color="neutral"
              variant="soft"
            >
              Gear + consumables included
            </UBadge>
            <UBadge
              color="neutral"
              variant="soft"
            >
              No startup fees
            </UBadge>
          </div>
        </div>

        <div class="studio-panel p-5 sm:p-6">
          <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
            What changes with membership
          </div>
          <div class="mt-4 space-y-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
            <p>Every membership includes studio equipment, backdrop paper, and day-to-day consumables. Book, pay, and show up ready to shoot.</p>
            <p>The space is 24/7 access with a 25x30 ft cyc, 20+ ft ceilings, makeup area, client seating, and props for product or fashion sessions.</p>
            <p>You can upgrade or downgrade as your workload changes. Priority booking and equipment holds scale with the plan level.</p>
            <p>Memberships are intentionally limited so the calendar stays usable for everyone.</p>
            <p v-if="isPlanSwitchMode">
              When changing an active membership, the new plan takes effect on your next billing cycle. Mid-cycle prorated membership changes are not applied.
            </p>
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
              {{ formatPeakCredits(tier.peak_multiplier) }}
            </div>
            <div class="text-xs uppercase tracking-[0.14em] text-[color:var(--gruv-ink-2)]">
              peak credits/hr
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

        <div class="rounded-2xl border border-[color:var(--gruv-line)] bg-[rgba(181,118,20,0.08)] p-4">
          <div class="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--gruv-ink-2)]">
            Starting at
          </div>
          <div class="mt-2 text-3xl font-semibold text-[color:var(--gruv-ink-0)]">
            {{ monthlyStartingLabel(tier) }}/mo
          </div>
          <p class="mt-2 text-xs leading-6 text-[color:var(--gruv-ink-2)]">
            Quarterly and annual savings are shown on the next step before checkout.
          </p>
        </div>

        <div class="grid gap-2">
          <UButton
            block
            @click="onSelectTier(tier.id)"
          >
            {{ isPlanSwitchMode ? `Change to ${tier.display_name}` : `Choose ${tier.display_name}` }}
          </UButton>
        </div>

        <div class="rounded-2xl border border-[color:var(--gruv-line)] bg-[rgba(181,118,20,0.08)] px-4 py-3 text-xs leading-6 text-[color:var(--gruv-ink-2)]">
          Includes up to {{ tier.holds_included }} overnight hold{{ tier.holds_included === 1 ? '' : 's' }} per month, full equipment access, and consumables like backdrop paper.
          Peak-time bookings use {{ formatPeakCredits(tier.peak_multiplier) }} credits per hour when demand is highest.
        </div>
      </article>
    </div>

    <div class="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
      <div class="studio-panel p-5 sm:p-6">
        <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
          Not ready for a membership yet?
        </div>
        <p class="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--gruv-ink-2)]">
          You can still book as a guest for one-off shoots. Membership becomes the better fit once the shoots are recurring
          and you want a predictable production rhythm.
        </p>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--gruv-ink-2)]">
          Film photographers are welcome too. Rush fee waivers are available when the lab is open and capacity allows.
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
  </UContainer>
</template>
