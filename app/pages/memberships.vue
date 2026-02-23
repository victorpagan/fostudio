<script setup lang="ts">
type Cadence = 'monthly' | 'quarterly' | 'annual'

type PlanOption = {
  cadence: Cadence
  provider_plan_variation_id: string
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
  membership_plan_variations: PlanOption[]
}

const route = useRoute()
const returnTo = computed(() => (route.query.returnTo as string | undefined) ?? '/dashboard')

const { data } = await useFetch<{ tiers: Tier[] }>('/api/membership/catalog', {
  default: () => ({ tiers: [] })
})

const tiers = computed(() => data.value?.tiers ?? [])

function formatMoney(cents: number, currency: string) {
  const dollars = (cents / 100).toFixed(0)
  return currency === 'USD' ? `$${dollars}` : `${dollars} ${currency}`
}

function cadenceLabel(c: Cadence) {
  if (c === 'monthly') return 'Monthly'
  if (c === 'quarterly') return 'Quarterly'
  return 'Annual'
}

function checkoutUrl(tierId: string, cadence: Cadence) {
  return `/checkout?tier=${encodeURIComponent(tierId)}&cadence=${encodeURIComponent(cadence)}&returnTo=${encodeURIComponent(returnTo.value)}`
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="max-w-3xl">
      <h1 class="text-3xl font-semibold tracking-tight sm:text-5xl">Memberships</h1>
      <p class="mt-4 text-base text-gray-600 dark:text-gray-300 sm:text-lg">
        Choose the membership that matches how you shoot. Credits are added monthly and can roll up to a cap.
      </p>
    </div>

    <div class="mt-10 grid gap-4 lg:grid-cols-3">
      <UCard v-for="tier in tiers" :key="tier.id">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="text-lg font-semibold">{{ tier.display_name }}</div>
            <div class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {{ tier.description || '' }}
            </div>
          </div>
        </div>

        <div class="mt-5 grid grid-cols-3 gap-2">
          <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
            <div class="text-sm font-medium">{{ tier.booking_window_days }}d</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">booking</div>
          </div>
          <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
            <div class="text-sm font-medium">{{ tier.peak_multiplier }}×</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">peak burn</div>
          </div>
          <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
            <div class="text-sm font-medium">{{ tier.max_bank }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">max bank</div>
          </div>
        </div>

        <div class="mt-6 space-y-2">
          <div class="text-sm font-medium">Choose cadence</div>

          <div v-for="opt in tier.membership_plan_variations" :key="opt.cadence" class="flex items-center justify-between gap-3 rounded-xl border border-gray-200/60 p-3 dark:border-gray-800/60">
            <div class="min-w-0">
              <div class="text-sm font-semibold flex items-center gap-2">
                <span>{{ cadenceLabel(opt.cadence) }}</span>
                <UBadge v-if="opt.discount_label" color="gray" variant="soft">{{ opt.discount_label }}</UBadge>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ opt.credits_per_month }} credits / month
              </div>
            </div>

            <div class="text-right shrink-0">
              <div class="text-sm font-semibold">{{ formatMoney(opt.price_cents, opt.currency) }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">per {{ opt.cadence === 'monthly' ? 'month' : opt.cadence === 'quarterly' ? 'quarter' : 'year' }}</div>
            </div>
          </div>
        </div>

        <div class="mt-6 grid gap-2">
          <UButton
            v-for="opt in tier.membership_plan_variations"
            :key="opt.cadence + '-btn'"
            :to="checkoutUrl(tier.id, opt.cadence)"
            block
          >
            Start {{ tier.display_name }} ({{ cadenceLabel(opt.cadence) }})
          </UButton>
        </div>

        <div class="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Holds included: {{ tier.holds_included }} · Peak hours burn at {{ tier.peak_multiplier }}×
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
