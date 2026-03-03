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
const isTest = computed(() => route.query.test === '1')

const status = ref<string>('pending')
const tries = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

async function poll() {
  if (!user.value) return
  const { data } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.value.sub)
    .maybeSingle()

  status.value = data?.status ?? (isTest.value ? 'active' : 'pending')
}

onMounted(async () => {
  await poll()
  if (status.value === 'active') {
    await navigateTo(returnTo.value)
    return
  }

  timer = setInterval(async () => {
    tries.value++
    await poll()
    if (status.value === 'active' || tries.value >= 10) {
      if (timer) clearInterval(timer)
      await navigateTo(returnTo.value)
    }
  }, 2000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mx-auto max-w-3xl space-y-4">
      <h1 class="text-3xl font-semibold tracking-tight">You’re all set</h1>

      <UCard>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          <span v-if="isTest">Test membership activated — no charge was made.</span>
          <span v-else>Thanks — your subscription is being activated.</span>
        </p>

        <div class="mt-3 text-sm">
          Current status:
          <UBadge :color="status === 'active' ? 'success' : 'neutral'" variant="soft">
            {{ status }}
          </UBadge>
        </div>

        <div class="mt-6 flex gap-2">
          <UButton to="/dashboard">Go to dashboard</UButton>
          <UButton color="neutral" variant="soft" to="/calendar">View calendar</UButton>
        </div>

        <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
          If activation doesn’t complete in a minute, it will once the Square webhook processes.
        </p>
      </UCard>
    </div>
  </UContainer>
</template>
