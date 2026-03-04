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
    <section class="studio-grid overflow-hidden rounded-[2rem] border border-[color:var(--gruv-line)] px-5 py-6 sm:px-8 sm:py-8">
      <div class="mx-auto max-w-4xl space-y-6">
        <div class="max-w-3xl space-y-4">
          <span class="studio-kicker">Checkout complete</span>
          <h1 class="studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-7xl">
            {{ isTest ? 'Your test membership is active.' : 'You are in. We are finishing the setup now.' }}
          </h1>
          <p class="text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
            <span v-if="isTest">No live charge was created. This flow is safe for internal checkout testing.</span>
            <span v-else>Your billing went through. The membership record will flip fully active as soon as the webhook finishes processing.</span>
          </p>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)]">
          <div class="studio-panel p-5 sm:p-6">
            <div class="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--gruv-ink-2)]">
              Current status
            </div>
            <div class="mt-3 flex items-center gap-3">
              <UBadge
                :color="status === 'active' ? 'success' : 'neutral'"
                variant="soft"
                size="lg"
              >
                {{ status }}
              </UBadge>
              <span class="text-sm text-[color:var(--gruv-ink-2)]">
                {{ status === 'active' ? 'Ready to book.' : 'Refreshing automatically.' }}
              </span>
            </div>

            <p class="mt-5 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              If activation is not complete within about a minute, it should finish as soon as the Square webhook lands.
            </p>
          </div>

          <div class="studio-panel p-5 sm:p-6">
            <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
              Next stop
            </div>
            <p class="mt-4 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              Head back to your dashboard to manage the membership, or check availability if you are ready to start planning a session.
            </p>

            <div class="mt-5 flex flex-col gap-2">
              <UButton :to="returnTo">
                Go to dashboard
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                to="/calendar"
              >
                View calendar
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  </UContainer>
</template>
