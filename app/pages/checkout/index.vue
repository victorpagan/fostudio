<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const errorMsg = ref<string | null>(null)

// Accept any tier string; validation happens server-side.
// Known values: 'creator', 'pro', 'studio_plus', 'test' (admin-only)
const tier = computed(() => {
  const t = (route.query.tier as string | undefined)?.toLowerCase()
  return t || 'creator'
})

const cadence = computed(() => {
  const c = (route.query.cadence as string | undefined)?.toLowerCase()
  if (c === 'monthly' || c === 'quarterly' || c === 'annual') return c
  return 'monthly'
})

const returnTo = computed(() => {
  const value = route.query.returnTo
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/dashboard/membership'
})

const isTestTier = computed(() => tier.value === 'test')

async function beginCheckout() {
  errorMsg.value = null
  loading.value = true
  try {
    const res = await $fetch<{ redirectUrl: string; provider: string }>('/api/checkout/session', {
      method: 'POST',
      body: {
        tier: tier.value,
        cadence: cadence.value,
        returnTo: returnTo.value
      }
    })

    // Test tier returns a local success URL — navigate within the SPA
    // Real Square tiers return an external Square-hosted URL
    if (res.provider === 'test' || res.redirectUrl.startsWith('/') || res.redirectUrl.startsWith(window.location.origin)) {
      const url = new URL(res.redirectUrl, window.location.origin)
      await router.push(url.pathname + url.search)
    } else {
      window.location.href = res.redirectUrl
    }
  } catch (e: any) {
    errorMsg.value = e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Checkout failed.'
    loading.value = false
  }
}

function formatCadence(c: string) {
  switch (c) {
    case 'monthly': return 'Monthly'
    case 'quarterly': return 'Quarterly (billed every 3 months)'
    case 'annual': return 'Annual (billed once per year)'
    default: return c
  }
}

function formatTier(t: string) {
  switch (t) {
    case 'creator': return 'Creator'
    case 'pro': return 'Pro'
    case 'studio_plus': return 'Studio+'
    case 'test': return 'Test (Admin)'
    default: return t
  }
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mx-auto max-w-2xl space-y-4">
      <div class="flex items-center gap-3">
        <h1 class="text-3xl font-semibold tracking-tight">Checkout</h1>
        <UBadge v-if="isTestTier" color="warning" variant="soft" icon="i-lucide-flask-conical" size="lg">
          Admin test — no charge
        </UBadge>
      </div>

      <UAlert v-if="errorMsg" color="error" variant="soft" icon="i-lucide-circle-alert" :title="errorMsg" />

      <UCard>
        <div class="space-y-3">
          <div class="text-sm text-dimmed uppercase tracking-wide font-medium">Order summary</div>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-dimmed">Plan</span>
              <span class="font-medium">{{ formatTier(tier) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-dimmed">Billing</span>
              <span>{{ formatCadence(cadence) }}</span>
            </div>
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

          <div v-else class="mt-3 text-sm text-dimmed">
            You'll be redirected to Square's secure checkout to complete your subscription.
          </div>

          <div class="mt-4 flex gap-2">
            <UButton :loading="loading" :disabled="loading" @click="beginCheckout">
              {{ isTestTier ? 'Activate test membership' : 'Continue to secure checkout' }}
            </UButton>
            <UButton color="neutral" variant="soft" :to="returnTo">
              Back
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
