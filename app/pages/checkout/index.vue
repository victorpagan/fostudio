<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

type TierId = 'creator' | 'pro' | 'studio_plus'
type Cadence = 'monthly' | 'quarterly' | 'annual'

const route = useRoute()
const loading = ref(false)
const errorMsg = ref<string | null>(null)

const tier = computed<TierId>(() => {
  const t = (route.query.tier as string | undefined)?.toLowerCase()
  if (t === 'creator' || t === 'pro' || t === 'studio_plus') return t
  return 'creator'
})

const cadence = computed<Cadence>(() => {
  const c = (route.query.cadence as string | undefined)?.toLowerCase()
  if (c === 'monthly' || c === 'quarterly' || c === 'annual') return c
  return 'monthly'
})

async function beginCheckout() {
  errorMsg.value = null
  loading.value = true
  try {
    const res = await $fetch<{ redirectUrl: string }>('/api/checkout/session', {
      method: 'POST',
      body: {
        tier: tier.value,
        cadence: cadence.value
      }
    })
    window.location.href = res.redirectUrl
  } catch (e: any) {
    errorMsg.value = e?.statusMessage ?? e?.message ?? 'Checkout failed.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mx-auto max-w-3xl space-y-4">
      <h1 class="text-3xl font-semibold tracking-tight">Checkout</h1>

      <UAlert v-if="errorMsg" color="error" variant="soft" :title="errorMsg" />

      <UCard>
        <div class="text-sm text-gray-600 dark:text-gray-300">
          Tier: <span class="font-medium">{{ tier }}</span>
        </div>
        <div class="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Cadence: <span class="font-medium">{{ cadence }}</span>
        </div>

        <div class="mt-4 text-sm text-gray-600 dark:text-gray-300">
          You’ll be redirected to secure checkout to start your subscription.
        </div>

        <div class="mt-6 flex gap-2">
          <UButton :loading="loading" :disabled="loading" @click="beginCheckout">
            Continue to secure checkout
          </UButton>
          <UButton color="neutral" variant="soft" to="/memberships">
            Back
          </UButton>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
