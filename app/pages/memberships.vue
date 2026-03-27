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
  max_slots: number | null
  cap: number | null
  active_members: number
  spots_left: number | null
  is_full: boolean
  holds_included: number
  adminOnly?: boolean
  membership_plan_variations: PlanOption[]
}

type SiteMembershipPlan = {
  id: string
  lead: string
  highlights: string[]
  detail: string
}

type SiteMembershipsContent = {
  hero: {
    kicker: string
    title: string
    description: string
    badges: string[]
  }
  infoPanel: {
    title: string
    paragraphs: string[]
  }
  creditsExplainer: {
    title: string
    description: string
    bullets: string[]
  }
  plans: SiteMembershipPlan[]
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const supabase = useSupabaseClient()
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

const { data: siteMemberships } = await useAsyncData('site:memberships', async () => {
  return await queryCollection('siteMemberships').first()
})

const membershipsContent = computed<SiteMembershipsContent>(() => {
  const fallback: SiteMembershipsContent = {
    hero: {
      kicker: 'Memberships',
      title: 'Credit-based studio booking for real production workflows.',
      description: 'Each plan mints monthly credits. You use credits to reserve studio time, with peak windows consuming credits at the plan’s peak rate.',
      badges: ['24/7 member access', 'Gear + consumables included', 'No startup fees']
    },
    infoPanel: {
      title: 'What changes with membership',
      paragraphs: [
        'Every membership includes studio equipment, backdrop paper, and day-to-day consumables. Book, pay, and show up ready to shoot.',
        'The space is 24/7 access with a 25x30 ft cyc, 20+ ft ceilings, makeup area, client seating, and props for product or fashion sessions.',
        'You can upgrade or downgrade as your workload changes. Priority booking and equipment holds scale with the plan level.',
        'Memberships are intentionally limited so the calendar stays usable for everyone.'
      ]
    },
    creditsExplainer: {
      title: 'How credits work',
      description: 'Credits keep booking simple. Your plan adds credits each month, and you spend them only when you reserve time, so your cost tracks your real production volume.',
      bullets: [
        'You can bank unused credits up to your plan cap.',
        'Off-peak sessions stretch your credits further while peak windows are priced higher.',
        'Quarterly and annual options are built for heavier usage and stronger month-to-month output.'
      ]
    },
    plans: []
  }

  return (siteMemberships.value as SiteMembershipsContent | null) ?? fallback
})

const planContentById = computed(() => {
  return new Map((membershipsContent.value.plans ?? []).map(plan => [plan.id, plan]))
})

const { data, refresh } = await useFetch<{ tiers: Tier[] }>('/api/membership/catalog', {
  default: () => ({ tiers: [] })
})

const tiers = computed(() => data.value?.tiers ?? [])
const visibleTiers = computed(() => {
  return tiers.value.filter(tier => !tier.adminOnly && tier.id !== 'test')
})

type MembershipStatusRow = {
  status: string | null
}

const { data: currentMembership } = await useAsyncData('memberships:current-status', async () => {
  if (!user.value?.sub) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return (data as MembershipStatusRow | null) ?? null
}, { watch: [() => user.value?.sub] })

const isPriorityMember = computed(() => {
  const status = (currentMembership.value?.status ?? '').toLowerCase()
  return status === 'active' || status === 'past_due'
})

const waitlistOpen = ref(false)
const waitlistSubmitting = ref(false)
const waitlistTierId = ref<string | null>(null)
const waitlistCadence = ref<Cadence>('monthly')
const waitlistEmail = ref('')
const waitlistPhone = ref('')

const waitlistTier = computed(() => {
  if (!waitlistTierId.value) return null
  return visibleTiers.value.find(tier => tier.id === waitlistTierId.value) ?? null
})

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

function tierContent(tierId: string) {
  return planContentById.value.get(tierId) ?? null
}

function tierLead(tier: Tier) {
  const content = tierContent(tier.id)
  if (content?.lead) return content.lead
  return tier.description ?? 'Flexible access built for real production schedules.'
}

function tierHighlights(tier: Tier) {
  const content = tierContent(tier.id)
  const baseHighlights = content?.highlights?.length
    ? content.highlights
    : ['Membership-first scheduling', 'Included studio equipment and consumables']

  const options = sortedOptions(tier)
  const monthly = monthlyOption(tier)?.credits_per_month ?? null
  const quarterly = options.find(option => option.cadence === 'quarterly')?.credits_per_month ?? null
  const annual = options.find(option => option.cadence === 'annual')?.credits_per_month ?? null
  const hasCreditBoost = monthly !== null
    && ((quarterly !== null && quarterly > monthly) || (annual !== null && annual > monthly))

  const creditCadenceLine = hasCreditBoost
    ? 'Quarterly and annual options include more credits per month for this tier.'
    : 'Quarterly and annual options are optimized for higher monthly shooting volume.'

  return [
    ...baseHighlights,
    creditCadenceLine,
    `Peak-time bookings use credits at ${formatPeakCredits(tier.peak_multiplier)}x the base rate.`
  ]
}

function tierDetail(tier: Tier) {
  if (tier.holds_included <= 0) {
    return 'No overnight equipment holds are included with this tier.'
  }
  return `Includes up to ${tier.holds_included} overnight equipment hold${tier.holds_included === 1 ? '' : 's'} per month. Holds are for gear/set continuity and do not reserve studio time.`
}

function monthlyCreditsPerMonth(tier: Tier) {
  return monthlyOption(tier)?.credits_per_month ?? 0
}

function tierSpotsLeftValue(tier: Tier) {
  return tier.cap === null ? null : Math.max(0, tier.spots_left ?? 0)
}

function tierSpotsLeftLabel(tier: Tier) {
  const spotsLeft = tierSpotsLeftValue(tier)
  if (spotsLeft === null) return 'Unlimited'
  return `${spotsLeft} slots left`
}

function tierSpotsLeftColor(tier: Tier): 'success' | 'warning' | 'error' | 'neutral' {
  const spotsLeft = tierSpotsLeftValue(tier)
  if (spotsLeft === null) return 'neutral'
  if (spotsLeft <= 2) return 'error'
  if (spotsLeft <= 5) return 'warning'
  return 'success'
}

function tierCardAccentClass(tier: Tier) {
  const normalized = tier.id.toLowerCase()
  if (normalized.includes('creator')) return 'membership-plan-card--accent-a'
  if (normalized.includes('pro')) return 'membership-plan-card--accent-b'
  if (normalized.includes('studio')) return 'membership-plan-card--accent-c'
  return 'membership-plan-card--accent-a'
}

function checkoutUrl(tierId: string) {
  const base = `/checkout?tier=${encodeURIComponent(tierId)}&returnTo=${encodeURIComponent(returnTo.value)}`
  return isPlanSwitchMode.value ? `${base}&mode=switch` : base
}

function onSelectTier(tierId: string) {
  router.push(checkoutUrl(tierId))
}

function isTierBlockedForCheckout(tier: Tier) {
  return tier.is_full && !isPriorityMember.value
}

function openWaitlist(tier: Tier, cadence: Cadence = 'monthly') {
  waitlistTierId.value = tier.id
  waitlistCadence.value = cadence
  waitlistEmail.value = user.value?.email ?? ''
  waitlistPhone.value = ''
  waitlistOpen.value = true
}

async function submitWaitlist() {
  if (!waitlistTierId.value) return

  waitlistSubmitting.value = true
  try {
    const res = await $fetch<{ message: string }>('/api/membership/waitlist', {
      method: 'POST',
      body: {
        tier: waitlistTierId.value,
        cadence: waitlistCadence.value,
        email: waitlistEmail.value.trim() || undefined,
        phone: waitlistPhone.value.trim() || undefined
      }
    })
    toast.add({
      title: 'Waitlist updated',
      description: res.message,
      color: 'success'
    })
    waitlistOpen.value = false
  } catch (error: unknown) {
    const e = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Could not join waitlist',
      description: e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Unknown error',
      color: 'error'
    })
  } finally {
    waitlistSubmitting.value = false
  }
}
</script>

<template>
  <div class="memberships-page space-y-8 py-10 sm:py-14">
    <section class="editorial-section">
      <div class="editorial-frame">
        <div class="editorial-grid memberships-hero-grid">
          <div class="editorial-cell editorial-meta">
            <p class="editorial-label">{{ membershipsContent.hero.kicker }}</p>
          </div>

          <div class="editorial-cell editorial-copy editorial-copy-texture">
            <UBadge
              v-if="isPlanSwitchMode"
              color="warning"
              variant="soft"
              class="w-fit"
            >
              Change mode: next billing cycle
            </UBadge>
            <h1 class="editorial-title mt-2">
              {{ membershipsContent.hero.title }}
            </h1>
            <p class="editorial-body">
              {{ membershipsContent.hero.description }}
            </p>
            <div class="memberships-hero-badges">
              <UBadge
                v-for="badge in membershipsContent.hero.badges"
                :key="badge"
                color="neutral"
                variant="soft"
              >
                {{ badge }}
              </UBadge>
            </div>
          </div>

          <div class="editorial-cell memberships-info-cell">
            <h2 class="memberships-info-title">
              {{ membershipsContent.infoPanel.title }}
            </h2>
            <div class="mt-4 space-y-3 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              <p
                v-for="paragraph in membershipsContent.infoPanel.paragraphs"
                :key="paragraph"
              >
                {{ paragraph }}
              </p>
              <p v-if="isPlanSwitchMode">
                When changing an active membership, the new plan takes effect on your next billing cycle. Mid-cycle prorated membership changes are not applied.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="editorial-section">
      <div class="editorial-frame">
        <div class="editorial-grid memberships-credits-grid">
          <div class="editorial-cell editorial-meta">
            <p class="editorial-label">CREDITS / SYSTEM</p>
          </div>
          <div class="editorial-cell editorial-copy editorial-copy-texture">
            <h2 class="editorial-title">
              {{ membershipsContent.creditsExplainer.title }}
            </h2>
            <p class="editorial-body">
              {{ membershipsContent.creditsExplainer.description }}
            </p>
          </div>
          <div class="editorial-cell memberships-credits-list">
            <div
              v-for="bullet in membershipsContent.creditsExplainer.bullets"
              :key="bullet"
              class="memberships-credits-item"
            >
              <span class="memberships-credits-dot" />
              <span>{{ bullet }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="editorial-section">
      <div class="editorial-frame">
        <div class="editorial-grid memberships-plans-grid">
          <div class="editorial-cell editorial-meta">
            <p class="editorial-label">PLANS / MEMBERSHIPS</p>
          </div>
          <div class="editorial-cell editorial-copy editorial-copy-texture">
            <h2 class="editorial-title">
              Choose your membership tier.
            </h2>
            <p class="editorial-body">
              Pick the plan that matches your current volume. You can move tiers as your production cadence changes.
            </p>
          </div>
          <div class="editorial-cell memberships-plan-list">
            <article
              v-for="tier in visibleTiers"
              :id="`plan-${tier.id}`"
              :key="tier.id"
              class="plan-card membership-plan-card scroll-mt-24"
              :class="tierCardAccentClass(tier)"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
                    {{ tier.display_name }}
                  </div>
                  <UBadge
                    v-if="tier.is_full"
                    color="error"
                    variant="soft"
                    size="xs"
                    class="mt-2"
                  >
                    Waitlist open
                  </UBadge>
                </div>
                <UBadge
                  size="xs"
                  variant="soft"
                  :color="tierSpotsLeftColor(tier)"
                >
                  {{ tierSpotsLeftLabel(tier) }}
                </UBadge>
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

              <div class="mt-auto space-y-4">
                <div class="grid grid-cols-3 gap-2">
                  <div class="plan-stat text-center">
                    <div class="text-lg font-semibold text-[color:var(--gruv-ink-0)]">
                      {{ tier.booking_window_days }}d
                    </div>
                    <div class="text-xs uppercase tracking-[0.14em] text-[color:var(--gruv-ink-2)]">
                      Booking Window
                    </div>
                  </div>
                  <div class="plan-stat text-center">
                    <div class="text-lg font-semibold text-[color:var(--gruv-ink-0)]">
                      {{ monthlyCreditsPerMonth(tier) }}
                    </div>
                    <div class="text-xs uppercase tracking-[0.14em] text-[color:var(--gruv-ink-2)]">
                      Cr / Month
                    </div>
                  </div>
                  <div class="plan-stat text-center">
                    <div class="text-lg font-semibold text-[color:var(--gruv-ink-0)]">
                      {{ tier.max_bank }}
                    </div>
                    <div class="text-xs uppercase tracking-[0.14em] text-[color:var(--gruv-ink-2)]">
                      Cr Cap
                    </div>
                  </div>
                </div>

                <div class="rounded-2xl bg-[color:var(--gruv-accent-soft)] p-4">
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
                    v-if="!isTierBlockedForCheckout(tier)"
                    block
                    @click="onSelectTier(tier.id)"
                  >
                    {{ isPlanSwitchMode ? `Change to ${tier.display_name}` : `Choose ${tier.display_name}` }}
                  </UButton>
                  <UButton
                    v-else
                    block
                    color="neutral"
                    variant="soft"
                    @click="openWaitlist(tier)"
                  >
                    Join waitlist
                  </UButton>
                  <p
                    v-if="tier.is_full && isPriorityMember"
                    class="text-xs text-dimmed"
                  >
                    Tier is full for new members. Active members still have priority for plan changes.
                  </p>
                </div>

                <div class="rounded-2xl bg-[color:var(--gruv-accent-soft)] px-4 py-3 text-xs leading-6 text-[color:var(--gruv-ink-2)]">
                  {{ tierDetail(tier) }}
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <UModal v-model:open="waitlistOpen">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-semibold">
                  Join Waitlist
                </div>
                <p class="mt-1 text-sm text-dimmed">
                  {{ waitlistTier?.display_name ?? 'Membership tier' }} is currently at capacity.
                </p>
              </div>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="waitlistOpen = false"
              />
            </div>
          </template>

          <div class="space-y-3">
            <UFormField label="Email">
              <UInput
                v-model="waitlistEmail"
                type="email"
                placeholder="you@example.com"
              />
            </UFormField>
            <UFormField label="Phone (optional)">
              <UInput
                v-model="waitlistPhone"
                placeholder="(555) 123-4567"
              />
            </UFormField>
            <UFormField label="Preferred cadence">
              <USelect
                v-model="waitlistCadence"
                :items="[
                  { label: 'Daily', value: 'daily' },
                  { label: 'Weekly', value: 'weekly' },
                  { label: 'Monthly', value: 'monthly' },
                  { label: 'Quarterly', value: 'quarterly' },
                  { label: 'Annual', value: 'annual' }
                ]"
                value-key="value"
                option-attribute="label"
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                @click="waitlistOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                :loading="waitlistSubmitting"
                @click="submitWaitlist"
              >
                Join waitlist
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
