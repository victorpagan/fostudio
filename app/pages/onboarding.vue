<!-- File: pages/onboarding.vue -->
<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

const returnTo = computed(() => {
  const value = route.query.returnTo
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/dashboard'
})

await $fetch('/api/account/bootstrap', { method: 'POST', body: {} })

const { data: membership } = await useAsyncData('myMembership', async () => {
  if (!user.value) return null
  const { data } = await supabase
    .from('memberships')
    .select('tier,status,created_at')
    .eq('user_id', user.value.sub)
    .single()
  return data
})
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mx-auto max-w-3xl space-y-4">
      <h1 class="text-3xl font-semibold tracking-tight">Onboarding</h1>

      <UCard>
        <div class="text-sm text-gray-600 dark:text-gray-300">
          Membership status:
          <span class="font-medium">{{ membership?.status ?? 'unknown' }}</span>
        </div>
        <div class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Next step: we’ll add waiver + policies + billing checkout.
        </div>
        <div class="mt-4 flex gap-2">
          <UButton to="/dashboard" color="neutral" variant="soft">Go to dashboard</UButton>
          <UButton :to="returnTo">{{ returnTo.startsWith('/checkout') ? 'Continue to checkout' : 'Continue' }}</UButton>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
