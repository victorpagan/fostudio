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
            <div class="flex items-center gap-2 text-lg font-semibold">
              <span>{{ tier.display_name }}</span>
              <UBadge v-if="tier.adminOnly" color="warning" variant="soft" size="xs" icon="i-lucide-flask-conical">
                Admin only
              </UBadge>
            </div>
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

          <div
            v-for="opt in tier.membership_plan_variations"
            :key="opt.cadence"
            class="flex items-center justify-between gap-3 rounded-xl border border-gray-200/60 p-3 dark:border-gray-800/60"
          >
            <div class="min-w-0">
              <div class="text-sm font-semibold flex items-center gap-2">
                <span>{{ cadenceLabel(opt.cadence) }}</span>
                <UBadge v-if="opt.discount_label" color="neutral" variant="soft">{{ opt.discount_label }}</UBadge>
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ opt.credits_per_month }} credits / month
              </div>
            </div>

            <div class="text-right shrink-0">
              <div class="text-sm font-semibold">{{ formatMoney(opt.price_cents, opt.currency) }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                per {{ opt.cadence === 'monthly' ? 'month' : opt.cadence === 'quarterly' ? 'quarter' : 'year' }}
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6 grid gap-2">
          <UButton
            v-for="opt in tier.membership_plan_variations"
            :key="opt.cadence + '-btn'"
            block
            @click="onSelectPlan(tier.id, opt.cadence)"
          >
            Start {{ tier.display_name }} ({{ cadenceLabel(opt.cadence) }})
          </UButton>
        </div>

        <div class="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Holds included: {{ tier.holds_included }} · Peak hours burn at {{ tier.peak_multiplier }}×
        </div>
      </UCard>
    </div>

    <!-- Sign-up prompt modal for unauthenticated users -->
    <UModal v-model:open="guestModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <p class="font-semibold">Create an account to continue</p>
              <UButton icon="i-heroicons-x-mark" color="neutral" variant="ghost" @click="guestModalOpen = false" />
            </div>
          </template>

          <div class="space-y-3">
            <p class="text-sm text-gray-600 dark:text-gray-400">
              A membership is tied to your account — you'll need one to book studio time,
              track credits, and manage your subscription. It only takes a minute.
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Your credit card is handled securely through Square. We never store payment details.
            </p>
          </div>

          <template #footer>
            <div class="flex flex-col gap-2 sm:flex-row">
              <UButton class="flex-1" @click="goSignup">
                Create account &amp; continue
              </UButton>
              <UButton color="neutral" variant="soft" class="flex-1" @click="goLogin">
                I already have an account
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </UContainer>
</template>
