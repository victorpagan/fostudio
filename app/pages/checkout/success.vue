<script setup lang="ts">
definePageMeta({ auth: false })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

const checkoutToken = computed(() => {
  const value = route.query.checkout
  return typeof value === 'string' ? value : null
})

const returnTo = computed(() => {
  const value = route.query.returnTo
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/dashboard/membership'
})

const successPath = computed(() => {
  const query = new URLSearchParams()
  if (checkoutToken.value) query.set('checkout', checkoutToken.value)
  query.set('returnTo', returnTo.value)
  return `/checkout/success?${query.toString()}`
})

const loginTo = computed(() => `/login?returnTo=${encodeURIComponent(successPath.value)}`)
const isTest = computed(() => route.query.test === '1')

const status = ref<string>('pending')
const claimLoading = ref(false)
const claimError = ref<string | null>(null)
const claimHint = ref<string | null>(null)
const claimedMembershipId = ref<string | null>(null)
const claimComplete = ref(false)
const activationReminderTriggered = ref(false)
const bootstrapAttempted = ref(false)

let timer: ReturnType<typeof setInterval> | null = null
let claimRetryTimer: ReturnType<typeof setTimeout> | null = null

const statusLabel = computed(() => {
  if (status.value === 'active') return 'Active'
  if (status.value === 'pending_checkout') return 'Activating'
  if (status.value === 'past_due') return 'Past due'
  if (status.value === 'canceled') return 'Canceled'
  if (status.value === 'completed') return 'Completed'
  return status.value
})

const statusColor = computed(() => {
  if (status.value === 'active') return 'success'
  if (status.value === 'pending_checkout') return 'warning'
  if (status.value === 'past_due' || status.value === 'canceled') return 'error'
  return 'neutral'
})

function startStatusPolling() {
  if (timer) clearInterval(timer)
  timer = setInterval(async () => {
    await pollLegacyMembershipStatus()
    if (status.value === 'active') {
      if (timer) clearInterval(timer)
      await navigateTo(returnTo.value)
    }
  }, 2500)
}

function scheduleClaimRetry() {
  if (claimRetryTimer) clearTimeout(claimRetryTimer)
  claimRetryTimer = setTimeout(() => {
    void claimCheckout()
  }, 2500)
}

async function pollLegacyMembershipStatus() {
  if (!user.value) return

  const { data } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.value.sub)
    .maybeSingle()

  status.value = data?.status ?? (isTest.value ? 'active' : 'pending')
}

async function triggerActivationReminder() {
  if (!checkoutToken.value || activationReminderTriggered.value) return
  activationReminderTriggered.value = true
  try {
    await $fetch('/api/checkout/remind-activation', {
      method: 'POST',
      body: { token: checkoutToken.value }
    })
  } catch {
    // Best-effort notification only; no UI interruption.
  }
}

async function ensureBootstrap() {
  if (!user.value || bootstrapAttempted.value) return
  bootstrapAttempted.value = true

  try {
    await $fetch('/api/account/bootstrap', {
      method: 'POST',
      body: {
        email: user.value.email ?? undefined
      }
    })
  } catch {
    // Keep checkout claim flow resilient; claim may still succeed without bootstrap.
  }
}

async function claimCheckout() {
  if (!checkoutToken.value || !user.value) return

  claimLoading.value = true
  claimError.value = null

  try {
    await ensureBootstrap()

    const res = await $fetch<{
      ok: boolean
      pending?: boolean
      message?: string
      membershipId?: string
      membershipStatus: string
      returnTo?: string
    }>('/api/checkout/claim', {
      method: 'POST',
      body: { token: checkoutToken.value }
    })

    status.value = res.membershipStatus || 'pending_checkout'
    claimHint.value = res.message ?? null

    if (!res.ok && res.pending) {
      claimComplete.value = false
      claimError.value = null
      scheduleClaimRetry()
      return
    }

    if (!res.ok) {
      claimError.value = res.message ?? 'Could not finish account linking.'
      claimComplete.value = false
      return
    }

    claimedMembershipId.value = res.membershipId ?? null
    claimComplete.value = true

    if (status.value === 'active') {
      await navigateTo(res.returnTo ?? returnTo.value)
    }
  } catch (error: unknown) {
    const e = error as {
      data?: { statusMessage?: string }
      statusMessage?: string
      message?: string
    }
    claimError.value = e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Could not finish account linking.'
  } finally {
    claimLoading.value = false
  }
}

onMounted(async () => {
  if (checkoutToken.value) {
    if (user.value) {
      await ensureBootstrap()
      await claimCheckout()
      if (status.value !== 'active' && !claimError.value) {
        startStatusPolling()
      }
    } else {
      status.value = 'pending_checkout'
      await triggerActivationReminder()
      await navigateTo(loginTo.value)
    }
    return
  }

  if (!user.value) {
    await navigateTo(loginTo.value)
    return
  }

  await pollLegacyMembershipStatus()
  if (status.value === 'active') {
    await navigateTo(returnTo.value)
    return
  }

  startStatusPolling()
})

watch(() => user.value?.sub, async (nextUserId) => {
  if (checkoutToken.value && nextUserId && !claimLoading.value && !claimComplete.value) {
    await ensureBootstrap()
    await claimCheckout()
  }
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (claimRetryTimer) clearTimeout(claimRetryTimer)
})
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <section class="studio-grid overflow-hidden rounded-[2rem] border border-[color:var(--gruv-line)] px-5 py-6 sm:px-8 sm:py-8">
      <div class="mx-auto max-w-2xl space-y-6">
        <div class="max-w-3xl space-y-4">
          <span class="studio-kicker">Checkout complete</span>
          <h1 class="studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-7xl">
            <span v-if="isTest">Your test membership is active.</span>
            <span v-else>Setting up your account.</span>
          </h1>
          <p class="text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
            <span v-if="checkoutToken && !user">Redirecting to sign in so we can finish setup.</span>
            <span v-else-if="isTest">No live charge was created. This flow is safe for internal checkout testing.</span>
            <span v-else>We are finalizing membership setup now. You will be redirected automatically.</span>
          </p>
        </div>

        <UAlert
          v-if="claimError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :title="claimError"
        />
        <UAlert
          v-else-if="claimHint"
          color="warning"
          variant="soft"
          icon="i-lucide-loader-circle"
          :title="claimHint"
        />

        <div class="studio-panel p-5 sm:p-6">
          <div class="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--gruv-ink-2)]">
            Current status
          </div>
          <div class="mt-3 flex items-center gap-3">
            <UBadge
              :color="statusColor"
              variant="soft"
              size="lg"
            >
              {{ statusLabel }}
            </UBadge>
            <span class="text-sm text-[color:var(--gruv-ink-2)]">
              <span v-if="claimLoading">Setting up account.</span>
              <span v-else-if="status === 'active'">Setup complete. Redirecting to dashboard.</span>
              <span v-else-if="status === 'pending_checkout'">Payment received. Finishing setup.</span>
              <span v-else>Sync in progress.</span>
            </span>
          </div>

          <p
            v-if="claimedMembershipId"
            class="mt-5 text-xs leading-6 text-[color:var(--gruv-ink-2)]"
          >
            Membership ID: {{ claimedMembershipId }}
          </p>
        </div>
      </div>
    </section>
  </UContainer>
</template>
