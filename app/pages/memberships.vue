<script setup lang="ts">
import type { PricingTableSection, PricingTableTier } from '@nuxt/ui'
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'

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

type ImportantBitsPayload = {
  guest: {
    hoursLabel: string
    bookingWindowDays: number
    minBookingHours: number
    ratePerCreditCents: number
    peakMultiplier: number
    bookingIncrementMinutes: number
    creditExpiryDays: number
  }
  standby: {
    enabled: boolean
    minOpenSlotHours: number
    discountPercent: number
    memberStartHourLabel: string
    memberWindowHours: number
    nonMemberWindowHours: number
  }
  featuredPromo: {
    code: string
    discountType: 'percent' | 'fixed_cents'
    discountValue: number
    endsAt: string | null
    tierNames: string[]
  } | null
}

type ComparisonFeatureKey
  = 'monthlyCredits'
    | 'access'
    | 'bookingWindow'
    | 'bookingLength'
    | 'offPeakRate'
    | 'peakRate'
    | 'standby'
    | 'holds'
    | 'creditPolicy'
    | 'workshops'

type ComparisonColumn = Record<ComparisonFeatureKey, string> & {
  id: string
  name: string
  category: string
  price: string
  priceNote: string
  tier: Tier | null
}

type MembershipPricingTier = PricingTableTier & {
  category: string
  source: ComparisonColumn
  availabilityLabel: string
  availabilityColor: 'success' | 'warning' | 'error' | 'neutral'
  availabilityClass: string
  priceSuffix: string
  priceFootnote: string
}

const comparisonRows: Array<{ key: ComparisonFeatureKey, label: string, note: string }> = [
  { key: 'monthlyCredits', label: 'Credits included', note: 'Recurring allocation' },
  { key: 'access', label: 'Studio access', note: 'When your account code works' },
  { key: 'bookingWindow', label: 'Booking window', note: 'How far ahead you can reserve' },
  { key: 'bookingLength', label: 'Booking length', note: 'Minimum and increments' },
  { key: 'offPeakRate', label: 'Off-peak rate', note: 'Base studio time' },
  { key: 'peakRate', label: 'Peak rate', note: 'Current high-demand hours' },
  { key: 'standby', label: 'Standby', note: 'Last-minute, same-day only' },
  { key: 'holds', label: 'Overnight holds', note: 'Keep an eligible setup in place' },
  { key: 'creditPolicy', label: 'Unused credits', note: 'Expiration or rollover' },
  { key: 'workshops', label: 'Workshop hosting', note: 'Account approval required' }
]

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
      kicker: 'Credits / Memberships',
      title: '',
      description: 'Start with flexible non-member booking or choose a membership for included credits, longer planning range, and better peak-hour value.',
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

const comparisonPolicyFallback: ImportantBitsPayload = {
  guest: {
    hoursLabel: '9 AM–9 PM',
    bookingWindowDays: 20,
    minBookingHours: 2,
    ratePerCreditCents: 5000,
    peakMultiplier: 2.5,
    bookingIncrementMinutes: 60,
    creditExpiryDays: 30
  },
  standby: {
    enabled: true,
    minOpenSlotHours: 3,
    discountPercent: 50,
    memberStartHourLabel: '8 AM',
    memberWindowHours: 10,
    nonMemberWindowHours: 6
  },
  featuredPromo: null
}

const { data: comparisonPolicyData } = await useFetch<ImportantBitsPayload>('/api/site/important-bits', {
  default: () => comparisonPolicyFallback
})
const comparisonPolicy = computed(() => comparisonPolicyData.value ?? comparisonPolicyFallback)

const tiers = computed(() => data.value?.tiers ?? [])
const visibleTiers = computed(() => {
  return tiers.value.filter(tier => !tier.adminOnly && tier.id !== 'test')
})

type MembershipStatusRow = {
  status: string | null
  current_period_end: string | null
  canceled_at: string | null
}

const { data: currentMembership } = await useAsyncData('memberships:current-status', async () => {
  if (!user.value?.sub) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('status,current_period_end,canceled_at')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return (data as MembershipStatusRow | null) ?? null
}, { watch: [() => user.value?.sub] })

const isPriorityMember = computed(() => {
  const status = resolveMembershipUiState(currentMembership.value)
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

function membershipCreditsLabel(tier: Tier) {
  const monthly = monthlyOption(tier)
  if (!monthly) return 'Not published'

  const highest = sortedOptions(tier)
    .filter(option => ['monthly', 'quarterly', 'annual'].includes(option.cadence))
    .reduce((best, option) => option.credits_per_month > best.credits_per_month ? option : best, monthly)

  if (highest.credits_per_month <= monthly.credits_per_month) {
    return `Starts at ${monthly.credits_per_month} / month`
  }

  return `Starts at ${monthly.credits_per_month} / month · up to ${highest.credits_per_month} with ${highest.cadence} billing`
}

function formatHourCount(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '')
}

const comparisonColumns = computed<ComparisonColumn[]>(() => {
  const policy = comparisonPolicy.value
  const nonMember: ComparisonColumn = {
    id: 'non-member',
    name: 'Non-member',
    category: 'No subscription',
    price: formatMoney(policy.guest.ratePerCreditCents, 'USD'),
    priceNote: 'Pay per credit; discounted packs are available.',
    monthlyCredits: 'Purchase as needed',
    access: `${policy.guest.hoursLabel} during confirmed bookings`,
    bookingWindow: `${policy.guest.bookingWindowDays} days ahead`,
    bookingLength: `${formatHourCount(policy.guest.minBookingHours)}-hour minimum · ${policy.guest.bookingIncrementMinutes}-minute increments`,
    offPeakRate: '1 credit / hour',
    peakRate: `${formatPeakCredits(policy.guest.peakMultiplier)} credits / hour`,
    standby: `Last-minute same-day · ${policy.standby.discountPercent}% fewer credits · up to ${formatHourCount(policy.standby.nonMemberWindowHours)}h reach`,
    holds: 'Not included',
    creditPolicy: `Purchased credits expire after ${policy.guest.creditExpiryDays} days`,
    workshops: 'Not included',
    tier: null
  }

  const memberColumns = visibleTiers.value.map((tier): ComparisonColumn => {
    const option = monthlyOption(tier)
    const holds = tier.holds_included > 0
      ? `${tier.holds_included} included / month`
      : 'Not included'
    return {
      id: tier.id,
      name: tier.display_name,
      category: 'Membership',
      price: option ? formatMoney(option.price_cents, option.currency) : 'Contact us',
      priceNote: option ? 'Starting monthly price; quarterly and annual options are available at checkout.' : 'Pricing is not currently published.',
      monthlyCredits: membershipCreditsLabel(tier),
      access: '24/7 member access',
      bookingWindow: `${tier.booking_window_days} days ahead`,
      bookingLength: '30-minute increments',
      offPeakRate: '1 credit / hour',
      peakRate: `${formatPeakCredits(tier.peak_multiplier)} credits / hour`,
      standby: `Last-minute same-day · ${policy.standby.discountPercent}% fewer credits · up to ${formatHourCount(policy.standby.memberWindowHours)}h reach`,
      holds,
      creditPolicy: `Rollover up to ${tier.max_bank} credits`,
      workshops: 'Available by approval',
      tier
    }
  })

  return [nonMember, ...memberColumns]
})

const pricingTableTiers = computed<MembershipPricingTier[]>(() => {
  return comparisonColumns.value.map((column) => {
    const sourceTier = column.tier
    return {
      id: column.id,
      title: column.name,
      description: sourceTier
        ? tierLead(sourceTier)
        : 'Flexible studio access for occasional shoots without a recurring plan.',
      category: column.category,
      price: column.price,
      highlight: column.id === 'pro',
      source: column,
      availabilityLabel: sourceTier ? tierSpotsLeftLabel(sourceTier) : 'No membership required',
      availabilityColor: sourceTier ? tierSpotsLeftColor(sourceTier) : 'neutral',
      availabilityClass: sourceTier ? tierSpotsLeftClass(sourceTier) : 'membership-slots-badge--neutral',
      priceSuffix: sourceTier ? 'per month' : 'per credit',
      priceFootnote: column.priceNote
    }
  })
})

const pricingTableSections = computed<PricingTableSection<MembershipPricingTier>[]>(() => {
  const feature = (row: typeof comparisonRows[number]) => ({
    id: row.key,
    title: row.label,
    tiers: Object.fromEntries(comparisonColumns.value.map(column => [column.id, column[row.key]]))
  })

  return [
    {
      id: 'access',
      title: 'Plan value + access',
      features: comparisonRows.slice(0, 4).map(feature)
    },
    {
      id: 'booking',
      title: 'Rates + booking flexibility',
      features: comparisonRows.slice(4).map(feature)
    }
  ]
})

function comparisonFeatureNote(featureId: string | undefined) {
  return comparisonRows.find(row => row.key === featureId)?.note ?? ''
}

const comparisonPromoSummary = computed(() => {
  const promo = comparisonPolicy.value.featuredPromo
  if (!promo) return null
  const discount = promo.discountType === 'percent'
    ? `${formatPeakCredits(promo.discountValue)}% off`
    : `${formatMoney(promo.discountValue, 'USD')} off`
  const endDate = promo.endsAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Los_Angeles'
      }).format(new Date(promo.endsAt))
    : null
  return `${discount} eligible memberships with code ${promo.code}${endDate ? ` through ${endDate}` : ''}.`
})

function comparisonActionLabel(column: ComparisonColumn) {
  if (!column.tier) return 'Create account'
  if (isTierBlockedForCheckout(column.tier)) return 'Join waitlist'
  return isPlanSwitchMode.value ? `Change to ${column.name}` : `Choose ${column.name}`
}

function selectComparisonColumn(column: ComparisonColumn) {
  if (!column.tier) return
  if (isTierBlockedForCheckout(column.tier)) {
    openWaitlist(column.tier)
    return
  }
  onSelectTier(column.tier.id)
}

function tierSpotsLeftValue(tier: Tier) {
  return tier.cap === null ? null : Math.max(0, tier.spots_left ?? 0)
}

function tierSpotsLeftLabel(tier: Tier) {
  const spotsLeft = tierSpotsLeftValue(tier)
  if (spotsLeft === null) return 'Unlimited'
  return `${spotsLeft} ${spotsLeft === 1 ? 'slot' : 'slots'} left`
}

function tierSpotsLeftColor(tier: Tier): 'success' | 'warning' | 'error' | 'neutral' {
  const spotsLeft = tierSpotsLeftValue(tier)
  if (spotsLeft === null) return 'neutral'
  if (spotsLeft <= 2) return 'error'
  if (spotsLeft <= 5) return 'warning'
  return 'success'
}

function tierSpotsLeftClass(tier: Tier) {
  return `membership-slots-badge--${tierSpotsLeftColor(tier)}`
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
  <UContainer class="memberships-page py-10 sm:py-14">
    <section
      id="plans"
      class="editorial-section memberships-comparison-section"
      data-reveal
      data-reveal-delay="70ms"
    >
      <div class="editorial-frame memberships-comparison-frame">
        <div class="memberships-comparison-heading">
          <div>
            <p class="editorial-label">
              PRICING / BENEFITS
            </p>
            <UBadge
              v-if="isPlanSwitchMode"
              color="warning"
              variant="soft"
              class="mt-3 w-fit"
            >
              Changes begin next billing cycle
            </UBadge>
            <h2 class="memberships-comparison-title">
              Compare every way to book.
            </h2>
            <p class="memberships-comparison-lead">
              Start without a subscription or choose the membership that matches how often, how far ahead, and when you need to shoot.
            </p>
          </div>
          <div
            v-if="comparisonPromoSummary"
            class="memberships-comparison-promo"
          >
            <span>Current offer</span>
            <strong>{{ comparisonPromoSummary }}</strong>
          </div>
        </div>

        <UPricingTable
          :tiers="pricingTableTiers"
          :sections="pricingTableSections"
          caption="Compare non-member booking with FO Studio membership tiers"
          class="memberships-pricing-table"
        >
          <template #tier-title="{ tier }">
            <span class="memberships-pricing-tier-category">{{ tier.category }}</span>
            <span class="memberships-pricing-tier-name">{{ tier.title }}</span>
          </template>

          <template #tier-badge="{ tier }">
            <UBadge
              size="xs"
              variant="solid"
              class="membership-slots-badge"
              :class="tier.availabilityClass"
              :color="tier.availabilityColor"
            >
              {{ tier.availabilityLabel }}
            </UBadge>
          </template>

          <template #tier-billing="{ tier }">
            <span class="memberships-pricing-price-suffix">{{ tier.priceSuffix }}</span>
            <span class="memberships-pricing-price-note">{{ tier.priceFootnote }}</span>
          </template>

          <template #tier-button="{ tier }">
            <UButton
              v-if="!tier.source.tier"
              to="/signup?returnTo=/dashboard/book"
              color="neutral"
              variant="soft"
              size="lg"
              block
            >
              {{ comparisonActionLabel(tier.source) }}
            </UButton>
            <div
              v-else
              class="grid gap-2"
            >
              <UButton
                size="lg"
                block
                :color="isTierBlockedForCheckout(tier.source.tier) ? 'neutral' : 'primary'"
                :variant="isTierBlockedForCheckout(tier.source.tier) ? 'soft' : 'solid'"
                @click="selectComparisonColumn(tier.source)"
              >
                {{ comparisonActionLabel(tier.source) }}
              </UButton>
              <p
                v-if="tier.source.tier.is_full && isPriorityMember"
                class="memberships-pricing-priority-note"
              >
                Active members retain priority for plan changes.
              </p>
            </div>
          </template>

          <template #feature-title="{ feature }">
            <span class="memberships-pricing-feature-label">
              <span
                v-if="feature.id === 'monthlyCredits'"
                class="memberships-pricing-feature-title-line"
              >
                <StudioCreditTooltip
                  label="Credits"
                  class="memberships-credit-help"
                />
                <span>included</span>
              </span>
              <span v-else>{{ feature.title }}</span>
              <small>{{ comparisonFeatureNote(feature.id) }}</small>
            </span>
          </template>
        </UPricingTable>
      </div>
    </section>

    <UModal
      v-model:open="waitlistOpen"
      title="Join the membership waitlist"
      description="Confirm your contact details and membership tier interest."
    >
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
                aria-label="Close waitlist form"
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
  </UContainer>
</template>
