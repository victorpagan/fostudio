<script setup lang="ts">
import { normalizeDiscountLabel, parseDiscountLabel } from '~~/app/utils/membershipDiscount'

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
  max_slots: number | null
  cap: number | null
  active_members: number
  spots_left: number | null
  is_full: boolean
  membership_plan_variations: PlanOption[]
}

const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const loading = ref(false)
const waitlistSubmitting = ref(false)
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
  if (queryValue === 'daily' || queryValue === 'weekly' || queryValue === 'monthly' || queryValue === 'quarterly' || queryValue === 'annual') return queryValue
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
const { data: currentMembership } = await useAsyncData('checkout:membership-status', async () => {
  if (!user.value?.sub) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as { status: string | null } | null
}, { watch: [() => user.value?.sub] })

const isPriorityMember = computed(() => {
  const status = (currentMembership.value?.status ?? '').toLowerCase()
  return status === 'active' || status === 'past_due'
})

const tierAtCapacity = computed(() => {
  if (isTestTier.value) return false
  return Boolean(selectedTier.value?.is_full) && !isPriorityMember.value
})
const sortedOptions = computed(() => {
  const options = selectedTier.value?.membership_plan_variations ?? []
  const order: Record<Cadence, number> = { daily: 0, weekly: 1, monthly: 2, quarterly: 3, annual: 4 }
  return [...options].sort((left, right) => order[left.cadence] - order[right.cadence])
})
const getDiscountLabel = (label?: string | null) => normalizeDiscountLabel(label)

const selectedPlan = computed(() =>
  sortedOptions.value.find(option => option.cadence === selectedCadence.value) ?? sortedOptions.value[0] ?? null
)
const monthlyOption = computed(() => sortedOptions.value.find(option => option.cadence === 'monthly') ?? null)
const selectedSavingsCents = computed(() => {
  if (!selectedPlan.value || !monthlyOption.value) return 0
  const months = cadenceToMonths(selectedPlan.value.cadence)
  if (!months || months <= 1) return 0
  const baseline = monthlyOption.value.price_cents * months
  return Math.max(0, baseline - billedCycleCents(selectedPlan.value))
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

  async function startSquareCheckoutSession(guestEmailForCheckout?: string) {
    const res = await $fetch<{ redirectUrl: string, provider: string }>('/api/checkout/session', {
      method: 'POST',
      body: {
        tier: selectedTier.value!.id,
        cadence: selectedPlan.value!.cadence,
        returnTo: returnTo.value,
        guest_email: guestEmailForCheckout || undefined
      }
    })

    if (res.provider === 'test' || res.redirectUrl.startsWith('/') || res.redirectUrl.startsWith(window.location.origin)) {
      const url = new URL(res.redirectUrl, window.location.origin)
      await router.push(url.pathname + url.search)
    } else {
      window.location.href = res.redirectUrl
    }
  }

  try {
    if (!selectedTier.value || !selectedPlan.value) {
      errorMsg.value = 'This membership option is not available right now.'
      loading.value = false
      return
    }

    if (tierAtCapacity.value) {
      errorMsg.value = `${selectedTier.value.display_name} is currently full. Join the waitlist to get notified when a spot opens.`
      loading.value = false
      return
    }

    if (isPlanSwitchMode.value) {
      if (!user.value) {
        errorMsg.value = 'Sign in to schedule a membership change.'
        loading.value = false
        return
      }

      // If the current membership is not managed in Square (ex: admin/test tier),
      // skip swap-plan and start a normal checkout session for the target plan.
      try {
        const { data: membership } = await supabase
          .from('memberships')
          .select('billing_provider,billing_subscription_id,square_subscription_id')
          .eq('user_id', user.value.sub)
          .maybeSingle()

        const billingProvider = (membership?.billing_provider ?? '').toLowerCase()
        const billingSubscriptionId = (membership?.billing_subscription_id ?? '').trim()
        const squareSubscriptionId = (membership?.square_subscription_id ?? '').trim()
        const hasManagedSquare = billingProvider === 'square' && (Boolean(billingSubscriptionId) || Boolean(squareSubscriptionId))

        if (!hasManagedSquare) {
          await startSquareCheckoutSession()
          return
        }
      } catch {
        // Fall through to existing switch-path logic.
      }

      try {
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
      } catch (switchError: unknown) {
        const message = readErrorMessage(switchError).toLowerCase()
        const canFallbackToCheckout
          = message.includes('not linked to a managed square subscription')
            || message.includes('could not load subscription from square')

        if (!canFallbackToCheckout) throw switchError

        await startSquareCheckoutSession()
        return
      }
    }

    const emailForCheckout = (user.value?.email ?? guestEmail.value).trim().toLowerCase()
    if (!user.value && !emailForCheckout) {
      errorMsg.value = 'Enter an email to continue.'
      loading.value = false
      return
    }

    await startSquareCheckoutSession(emailForCheckout)
  } catch (error: unknown) {
    errorMsg.value = readErrorMessage(error)
    loading.value = false
  }
}

function readErrorMessage(error: unknown) {
  const e = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  }
  return e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Checkout failed.'
}

function formatCadence(cadence: Cadence) {
  switch (cadence) {
    case 'daily': return 'Daily (billed every day)'
    case 'weekly': return 'Weekly (billed every week)'
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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}

function cadenceToMonths(cadence: Cadence) {
  switch (cadence) {
    case 'monthly': return 1
    case 'quarterly': return 3
    case 'annual': return 12
    default: return null
  }
}

function effectiveMonthlyCents(option: PlanOption) {
  const months = cadenceToMonths(option.cadence)
  if (!months) return null
  return Math.round(billedCycleCents(option) / months)
}

function savingsVsMonthlyCents(option: PlanOption) {
  if (!monthlyOption.value) return 0
  const months = cadenceToMonths(option.cadence)
  if (!months || months <= 1) return 0
  const baseline = monthlyOption.value.price_cents * months
  return Math.max(0, baseline - billedCycleCents(option))
}

function billedCycleCents(option: PlanOption) {
  const months = cadenceToMonths(option.cadence)
  if (!months) return option.price_cents

  const monthlyBase = monthlyOption.value?.price_cents ?? option.price_cents
  let cycleCents = monthlyBase * months
  const discount = parseDiscountLabel(option.discount_label)

  if (discount.type === 'percent') {
    const pct = Number(discount.amount)
    if (Number.isFinite(pct) && pct > 0) {
      const clampedPct = Math.min(100, Math.max(0, pct))
      cycleCents = Math.round(cycleCents * (1 - (clampedPct / 100)))
    }
  }

  if (discount.type === 'dollar') {
    const dollarAmount = Number(discount.amount)
    if (Number.isFinite(dollarAmount) && dollarAmount > 0) {
      cycleCents = Math.max(0, cycleCents - Math.round(dollarAmount * 100))
    }
  }

  return cycleCents
}

function cadencePriceSuffix(cadence: Cadence) {
  if (cadence === 'daily') return '/day'
  if (cadence === 'weekly') return '/week'
  if (cadence === 'quarterly') return '/quarter'
  if (cadence === 'annual') return '/year'
  return '/mo'
}

function cadenceCreditsSuffix(cadence: Cadence) {
  if (cadence === 'daily') return 'per day'
  if (cadence === 'weekly') return 'per week'
  return 'per month'
}

async function submitWaitlist() {
  if (!selectedTier.value) return
  waitlistSubmitting.value = true
  try {
    const waitlistEmail = (user.value?.email ?? guestEmail.value).trim()
    const res = await $fetch<{ message: string }>('/api/membership/waitlist', {
      method: 'POST',
      body: {
        tier: selectedTier.value.id,
        cadence: selectedCadence.value,
        email: waitlistEmail || undefined
      }
    })
    toast.add({
      title: 'Waitlist updated',
      description: res.message,
      color: 'success'
    })
  } catch (error: unknown) {
    errorMsg.value = readErrorMessage(error)
  } finally {
    waitlistSubmitting.value = false
  }
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
        v-if="tierAtCapacity"
        color="warning"
        variant="soft"
        icon="i-lucide-users"
        :title="`${selectedTier?.display_name ?? 'This tier'} is currently full`"
        description="New member checkout is paused for this tier. Join the waitlist and we will email you when a spot opens."
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
              v-if="selectedTier"
              class="flex justify-between"
            >
              <span class="text-dimmed">Capacity</span>
              <span>
                {{ selectedTier.cap === null ? 'Unlimited' : `${selectedTier.active_members}/${selectedTier.cap}` }}
              </span>
            </div>
            <div
              v-if="selectedPlan"
              class="flex justify-between"
            >
              <span class="text-dimmed">Price</span>
              <span class="font-medium">{{ formatMoney(billedCycleCents(selectedPlan), selectedPlan.currency) }} {{ cadencePriceSuffix(selectedPlan.cadence) }}</span>
            </div>
            <div
              v-if="selectedPlan && effectiveMonthlyCents(selectedPlan) !== null"
              class="flex justify-between"
            >
              <span class="text-dimmed">Effective monthly</span>
              <span>{{ formatMoney(effectiveMonthlyCents(selectedPlan) ?? 0, selectedPlan.currency) }}/mo</span>
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
              <span>{{ selectedPlan.credits_per_month }} {{ cadenceCreditsSuffix(selectedPlan.cadence) }}</span>
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
            <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                  {{ formatMoney(billedCycleCents(option), option.currency) }}
                </div>
                <div
                  v-if="effectiveMonthlyCents(option) !== null && option.cadence !== 'monthly'"
                  class="mt-1 text-xs text-dimmed"
                >
                  {{ formatMoney(effectiveMonthlyCents(option) ?? 0, option.currency) }}/mo effective
                </div>
                <div
                  v-if="savingsVsMonthlyCents(option) > 0"
                  class="mt-1 text-xs font-medium text-[color:var(--gruv-accent)]"
                >
                  Save {{ formatMoney(savingsVsMonthlyCents(option), option.currency) }} vs monthly
                </div>
                <div
                  v-else-if="getDiscountLabel(option.discount_label)"
                  class="mt-1 text-xs text-[color:var(--gruv-accent)]"
                >
                  {{ getDiscountLabel(option.discount_label) }}
                </div>
              </button>
            </div>
            <p class="text-xs text-dimmed">
              Longer billing cadences can reduce effective monthly cost. Credits still release month by month.
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
              v-if="!tierAtCapacity"
              :loading="loading"
              :disabled="loading || !selectedPlan || (!user && isPlanSwitchMode) || (!isPlanSwitchMode && !user && !guestEmail.trim())"
              @click="beginCheckout"
            >
              {{ isPlanSwitchMode
                ? 'Schedule plan change'
                : (isTestTier ? 'Activate test membership' : 'Continue to secure checkout') }}
            </UButton>
            <UButton
              v-else
              :loading="waitlistSubmitting"
              :disabled="!user && !guestEmail.trim()"
              @click="submitWaitlist"
            >
              Join waitlist
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
