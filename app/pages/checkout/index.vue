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
  membership_plan_variations: PlanOption[]
}

const route = useRoute()
const router = useRouter()
const user = useSupabaseUser()
const toast = useToast()
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const selectedCadence = ref<Cadence>('monthly')
const guestEmail = ref('')

const { data } = await useFetch<{ tiers: Tier[] }>('/api/membership/catalog', {
  default: () => ({ tiers: [] })
})

const tiers = computed(() => data.value?.tiers ?? [])

const tier = computed(() => {
  const queryTier = (route.query.tier as string | undefined)?.toLowerCase()
  return queryTier || 'creator'
})

const queryCadence = computed<Cadence | null>(() => {
  const queryValue = (route.query.cadence as string | undefined)?.toLowerCase()
  if (queryValue === 'monthly' || queryValue === 'quarterly' || queryValue === 'annual') return queryValue
  return null
})
const isPlanSwitchMode = computed(() => {
  const mode = route.query.mode
  if (typeof mode !== 'string') return false
  return mode.toLowerCase() === 'switch'
})

const returnTo = computed(() => {
  const value = route.query.returnTo
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/dashboard/membership'
})
const loginTo = computed(() => `/login?returnTo=${encodeURIComponent(route.fullPath)}`)
const signupTo = computed(() => `/signup?returnTo=${encodeURIComponent(route.fullPath)}`)

const isTestTier = computed(() => tier.value === 'test')
const selectedTier = computed(() => tiers.value.find(item => item.id === tier.value) ?? null)
const sortedOptions = computed(() => {
  const options = selectedTier.value?.membership_plan_variations ?? []
  const order: Record<Cadence, number> = { monthly: 0, quarterly: 1, annual: 2 }
  return [...options].sort((left, right) => order[left.cadence] - order[right.cadence])
})
const selectedPlan = computed(() =>
  sortedOptions.value.find(option => option.cadence === selectedCadence.value) ?? sortedOptions.value[0] ?? null
)
const monthlyOption = computed(() => sortedOptions.value.find(option => option.cadence === 'monthly') ?? null)
const selectedSavingsCents = computed(() => {
  if (!selectedPlan.value || !monthlyOption.value) return 0
  const months = billingMonths(selectedPlan.value.cadence)
  if (months <= 1) return 0
  const baseline = monthlyOption.value.price_cents * months
  return Math.max(0, baseline - selectedPlan.value.price_cents)
})

watch([sortedOptions, queryCadence], ([options, cadence]) => {
  if (cadence && options.some(option => option.cadence === cadence)) {
    selectedCadence.value = cadence
    return
  }

  selectedCadence.value = options.find(option => option.cadence === 'monthly')?.cadence ?? options[0]?.cadence ?? 'monthly'
}, { immediate: true })

async function beginCheckout() {
  errorMsg.value = null
  loading.value = true

  try {
    if (!selectedTier.value || !selectedPlan.value) {
      errorMsg.value = 'This membership option is not available right now.'
      loading.value = false
      return
    }

    if (isPlanSwitchMode.value) {
      if (!user.value) {
        errorMsg.value = 'Sign in to schedule a membership change.'
        loading.value = false
        return
      }

      const res = await $fetch<{
        ok: boolean
        effectiveDate: string | null
        target: {
          displayName: string
          cadence: Cadence
        }
        message: string
      }>('/api/membership/change-plan', {
        method: 'POST',
        body: {
          tier: selectedTier.value.id,
          cadence: selectedPlan.value.cadence
        }
      })

      const effective = res.effectiveDate
        ? new Date(res.effectiveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'the next billing cycle'
      toast.add({
        title: 'Plan change scheduled',
        description: `${res.target.displayName} (${formatCadence(res.target.cadence)}) will start ${effective}.`,
        color: 'success'
      })
      await router.push(returnTo.value)
      return
    }

    const emailForCheckout = (user.value?.email ?? guestEmail.value).trim().toLowerCase()
    if (!user.value && !emailForCheckout) {
      errorMsg.value = 'Enter an email to continue.'
      loading.value = false
      return
    }

    const res = await $fetch<{ redirectUrl: string, provider: string }>('/api/checkout/session', {
      method: 'POST',
      body: {
        tier: selectedTier.value.id,
        cadence: selectedPlan.value.cadence,
        returnTo: returnTo.value,
        guest_email: emailForCheckout || undefined
      }
    })

    if (res.provider === 'test' || res.redirectUrl.startsWith('/') || res.redirectUrl.startsWith(window.location.origin)) {
      const url = new URL(res.redirectUrl, window.location.origin)
      await router.push(url.pathname + url.search)
    } else {
      window.location.href = res.redirectUrl
    }
  } catch (error: unknown) {
    const e = error as {
      data?: { statusMessage?: string }
      statusMessage?: string
      message?: string
    }
    errorMsg.value = e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Checkout failed.'
    loading.value = false
  }
}

function formatCadence(cadence: Cadence) {
  switch (cadence) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly (billed every 3 months)'
    case 'annual': return 'Annual (billed once per year)'
  }
}

function formatTier(tierId: string) {
  switch (tierId) {
    case 'creator': return 'Creator'
    case 'pro': return 'Pro'
    case 'studio_plus': return 'Studio+'
    case 'test': return 'Test (Admin)'
    default: return tierId
  }
}

function formatMoney(cents: number, currency: string) {
  const dollars = (cents / 100).toFixed(0)
  return currency === 'USD' ? `$${dollars}` : `${dollars} ${currency}`
}

function billingMonths(cadence: Cadence) {
  switch (cadence) {
    case 'monthly': return 1
    case 'quarterly': return 3
    case 'annual': return 12
  }
}

function effectiveMonthlyCents(option: PlanOption) {
  return Math.round(option.price_cents / billingMonths(option.cadence))
}

function savingsVsMonthlyCents(option: PlanOption) {
  if (!monthlyOption.value) return 0
  const months = billingMonths(option.cadence)
  if (months <= 1) return 0
  const baseline = monthlyOption.value.price_cents * months
  return Math.max(0, baseline - option.price_cents)
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mx-auto max-w-3xl space-y-4">
      <div class="flex items-center gap-3">
        <h1 class="text-3xl font-semibold tracking-tight">
          {{ isPlanSwitchMode ? 'Schedule plan change' : 'Finalize your membership' }}
        </h1>
        <UBadge
          v-if="isTestTier"
          color="warning"
          variant="soft"
          icon="i-lucide-flask-conical"
          size="lg"
        >
          Admin test — no charge
        </UBadge>
      </div>

      <UAlert
        v-if="errorMsg"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :title="errorMsg"
      />

      <UAlert
        v-if="isPlanSwitchMode"
        color="neutral"
        variant="soft"
        icon="i-lucide-calendar-clock"
        title="Changes apply at the next billing cycle"
        description="Upgrades and downgrades are scheduled to your next billing renewal date. We do not apply prorated mid-cycle membership changes."
      />
      <UAlert
        v-if="isPlanSwitchMode && !user"
        color="warning"
        variant="soft"
        icon="i-lucide-log-in"
        title="Sign in required"
        :description="`Sign in before scheduling membership changes.`"
      />

      <UCard>
        <div class="space-y-3">
          <div class="text-sm text-dimmed uppercase tracking-wide font-medium">
            Plan summary
          </div>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-dimmed">Plan</span>
              <span class="font-medium">{{ selectedTier?.display_name || formatTier(tier) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-dimmed">Billing</span>
              <span>{{ selectedPlan ? formatCadence(selectedPlan.cadence) : 'Not available' }}</span>
            </div>
            <div
              v-if="selectedPlan"
              class="flex justify-between"
            >
              <span class="text-dimmed">Price</span>
              <span class="font-medium">{{ formatMoney(selectedPlan.price_cents, selectedPlan.currency) }}</span>
            </div>
            <div
              v-if="selectedPlan"
              class="flex justify-between"
            >
              <span class="text-dimmed">Effective monthly</span>
              <span>{{ formatMoney(effectiveMonthlyCents(selectedPlan), selectedPlan.currency) }}/mo</span>
            </div>
            <div
              v-if="selectedPlan && selectedSavingsCents > 0"
              class="flex justify-between text-[color:var(--gruv-accent)]"
            >
              <span>Savings vs monthly</span>
              <span class="font-medium">{{ formatMoney(selectedSavingsCents, selectedPlan.currency) }} per billing cycle</span>
            </div>
            <div
              v-if="selectedPlan"
              class="flex justify-between"
            >
              <span class="text-dimmed">Credits</span>
              <span>{{ selectedPlan.credits_per_month }} per month</span>
            </div>
          </div>

          <div
            v-if="!isPlanSwitchMode && !user"
            class="rounded-xl border border-[color:var(--gruv-line)] bg-[rgba(181,118,20,0.08)] p-3 space-y-2"
          >
            <div class="text-sm font-medium">
              Email for membership setup
            </div>
            <UInput
              v-model="guestEmail"
              type="email"
              placeholder="you@example.com"
            />
            <p class="text-xs text-dimmed">
              You’ll pay through Square first, then create or sign in to your account on the success page to claim this membership.
            </p>
            <p class="text-xs text-dimmed">
              Already have an account?
              <NuxtLink
                class="underline"
                :to="loginTo"
              >
                Log in
              </NuxtLink>
              ·
              <NuxtLink
                class="underline"
                :to="signupTo"
              >
                Create account
              </NuxtLink>
            </p>
          </div>

          <div
            v-if="!isTestTier && sortedOptions.length > 0"
            class="space-y-2 pt-2"
          >
            <div class="text-sm font-medium">
              Choose billing cadence
            </div>
            <div class="grid gap-2 sm:grid-cols-3">
              <button
                v-for="option in sortedOptions"
                :key="option.cadence"
                class="rounded-xl border px-3 py-3 text-left transition-colors"
                :class="selectedCadence === option.cadence
                  ? 'border-[color:var(--gruv-accent)] bg-[rgba(181,118,20,0.12)]'
                  : 'border-[color:var(--gruv-line)] hover:bg-[rgba(181,118,20,0.08)]'"
                @click="selectedCadence = option.cadence"
              >
                <div class="text-sm font-semibold">
                  {{ formatCadence(option.cadence).split(' (')[0] }}
                </div>
                <div class="mt-1 text-xs text-dimmed">
                  {{ formatMoney(option.price_cents, option.currency) }}
                </div>
                <div
                  v-if="option.cadence !== 'monthly'"
                  class="mt-1 text-xs text-dimmed"
                >
                  {{ formatMoney(effectiveMonthlyCents(option), option.currency) }}/mo effective
                </div>
                <div
                  v-if="savingsVsMonthlyCents(option) > 0"
                  class="mt-1 text-xs font-medium text-[color:var(--gruv-accent)]"
                >
                  Save {{ formatMoney(savingsVsMonthlyCents(option), option.currency) }} vs monthly
                </div>
                <div
                  v-else-if="option.discount_label"
                  class="mt-1 text-xs text-[color:var(--gruv-accent)]"
                >
                  {{ option.discount_label }}
                </div>
              </button>
            </div>
            <p class="text-xs text-dimmed">
              Quarterly and annual options can lower effective monthly cost. Credits still release month by month.
            </p>
          </div>

          <UAlert
            v-if="isTestTier"
            class="mt-3"
            color="warning"
            variant="soft"
            icon="i-lucide-flask-conical"
            title="Admin test tier"
            description="This checkout will immediately activate a test membership without creating a Square subscription or charging any payment method."
          />

          <div
            v-else-if="!isPlanSwitchMode"
            class="mt-3 text-sm text-dimmed"
          >
            You’ll be redirected to Square’s secure checkout to complete payment. After payment, you’ll create or sign in to your account to finish activation.
          </div>
          <div
            v-else
            class="mt-3 text-sm text-dimmed"
          >
            Confirming here schedules your plan change with Square for your next billing cycle.
          </div>

          <div class="mt-4 flex gap-2">
            <UButton
              :loading="loading"
              :disabled="loading || !selectedPlan || (!user && isPlanSwitchMode) || (!isPlanSwitchMode && !user && !guestEmail.trim())"
              @click="beginCheckout"
            >
              {{ isPlanSwitchMode
                ? 'Schedule plan change'
                : (isTestTier ? 'Activate test membership' : 'Continue to secure checkout') }}
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              :to="returnTo"
            >
              Back
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
